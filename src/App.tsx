import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useScale } from './hooks/useScale';
import { ScaleConnection } from './components/ScaleConnection';
import { ModeSelect } from './components/ModeSelect';
import { SessionSetup } from './components/SessionSetup';
import { WeighingStation } from './components/WeighingStation';
import { VerificationSummary } from './components/VerificationSummary';
// ScannerHowTo is now embedded in WetSetup — no standalone page
import { ScannerPortal } from './components/ScannerPortal';
import { WetSetup } from './components/WetSetup';
import { WetWeighingStation } from './components/WetWeighingStation';
import { WetSummary } from './components/WetSummary';
import { HarvestHistory } from './components/HarvestHistory';
import { UserGuide } from './components/UserGuide';
import { exportExcel } from './lib/export';
import { exportWetExcel } from './lib/wet-export';
import { loadSession, clearSession, createDebouncedSave, peekSession } from './lib/session-persistence';
import { enqueue as enqueueCloudOp, startFlushWorker } from './lib/outbox';
import { getDeviceId } from './lib/device-id';
import { cloudEnabled } from './lib/supabase';
import { listCloudHarvests, countReadingsPerHarvest, loadCloudHarvest, type CloudHarvestSummary } from './lib/cloud';
import { useCloudHarvest } from './hooks/useCloudHarvest';
import type { SaveMode } from './components/WetSetup';
import type {
  AppPhase, ScaleReading, StrainConfig, StrainSession, WeightReading,
  WorkflowMode, HarvestBatchConfig, HarvestSession, WetWeightReading,
} from './lib/types';

export function formatTimeAgo(date: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function App() {
  // Check if this is the scanner portal route
  const isScannerPortal = window.location.hash === '#/scanner';

  if (isScannerPortal) {
    const wsUrl = `ws://${window.location.host}/ws/scanner`;
    return <ScannerPortal wsUrl={wsUrl} />;
  }

  return <MainApp />;
}

function MainApp() {
  const scale = useScale();
  const [phase, setPhase] = useState<AppPhase>('connect');
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);

  // Dry weight state
  const [strainConfigs, setStrainConfigs] = useState<StrainConfig[]>([]);
  const [sessions, setSessions] = useState<StrainSession[]>([]);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);

  // Wet weight state
  const [harvestSession, setHarvestSession] = useState<HarvestSession | null>(null);

  // Demo mode
  const [demoMode, setDemoMode] = useState(false);
  const [demoReading, setDemoReading] = useState<ScaleReading | null>(null);
  const demoIntervalRef = useRef<number | null>(null);

  const [sessionRestored, setSessionRestored] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingResume, setPendingResume] = useState<ReturnType<typeof peekSession>>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>('local');
  const [cloudResumeList, setCloudResumeList] = useState<Array<CloudHarvestSummary & { recorded: number }>>([]);
  const [cloudResumeDismissed, setCloudResumeDismissed] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState<string | null>(null);
  const deviceIdRef = useRef<string>('');
  if (!deviceIdRef.current) deviceIdRef.current = getDeviceId();

  // Global ? shortcut to open guide
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setGuideOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const debouncedSave = useMemo(
    () => createDebouncedSave(300, at => setLastSavedAt(at)),
    [],
  );

  // Peek at saved session on mount — show resume card instead of auto-restoring
  useEffect(() => {
    const meta = peekSession();
    if (meta && meta.recorded > 0 && meta.recorded < meta.total) {
      setPendingResume(meta);
    }
  }, []);

  // Start cloud outbox flush worker once. No-op if cloud is disabled.
  useEffect(() => {
    const stop = startFlushWorker();
    return stop;
  }, []);

  // Fetch list of active cloud harvests so user can resume one started on another device.
  useEffect(() => {
    if (!cloudEnabled) return;
    let cancelled = false;
    (async () => {
      const listResult = await listCloudHarvests(10);
      if (cancelled || !listResult.ok) return;
      const ids = listResult.data.map(h => h.id);
      const countResult = await countReadingsPerHarvest(ids);
      if (cancelled) return;
      const counts = countResult.ok ? countResult.data : {};
      // Filter to harvests that are still in progress — skip ones that hit their total.
      const filtered = listResult.data
        .map(h => ({ ...h, recorded: counts[h.id] ?? 0 }))
        .filter(h => h.recorded < h.total_plants);
      setCloudResumeList(filtered);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleResumeCloud = async (harvestId: string) => {
    setCloudLoadError(null);
    const result = await loadCloudHarvest(harvestId);
    if (!result.ok) {
      setCloudLoadError(result.error);
      return;
    }
    setHarvestSession(result.data);
    setWorkflowMode('wet');
    setPhase('wetWeighing');
    setSaveMode('cloud');         // continue syncing new captures back
    setDemoMode(true);            // no physical scale from a resumed cloud session
    setCloudResumeDismissed(true);
    setPendingResume(null);
    setCloudResumeList([]);
  };

  const handleDismissCloudResume = () => {
    setCloudResumeDismissed(true);
  };

  const handleResumeSession = () => {
    const saved = loadSession();
    if (saved) {
      setHarvestSession(saved.harvestSession);
      setWorkflowMode(saved.workflowMode);
      setPhase(saved.phase);
      setDemoMode(true); // restored sessions run in demo (no scale connection yet)
      setSessionRestored(true);
      setTimeout(() => setSessionRestored(false), 4000);
    }
    setPendingResume(null);
  };

  const handleDiscardResume = () => {
    clearSession();
    setPendingResume(null);
  };

  // Auto-save whenever harvestSession changes
  useEffect(() => {
    if (harvestSession && workflowMode) {
      debouncedSave(harvestSession, workflowMode, phase);
    }
  }, [harvestSession, workflowMode, phase, debouncedSave]);

  const demoTargetRef = useRef(450);
  const demoTickRef = useRef(0);

  useEffect(() => {
    if (demoMode && (phase === 'weighing' || phase === 'wetWeighing')) {
      // Pick a new target weight each time we enter weighing
      demoTargetRef.current = 300 + Math.random() * 300;
      demoTickRef.current = 0;

      demoIntervalRef.current = window.setInterval(() => {
        demoTickRef.current++;
        const tick = demoTickRef.current;
        const target = demoTargetRef.current;

        // First few ticks: fluctuate, then settle to stable target
        let weight: number;
        let stable: boolean;
        if (tick <= 3) {
          // Settling — jitter around target
          weight = target + (Math.random() - 0.5) * 20;
          stable = false;
        } else {
          // Stable — exact same value every time
          weight = target;
          stable = true;
        }

        setDemoReading({
          weight: Math.round(weight * 10) / 10,
          unit: 'g',
          stable,
          mode: 'G',
        });
      }, 500);
      return () => { if (demoIntervalRef.current) clearInterval(demoIntervalRef.current); };
    }
  }, [demoMode, phase]);

  // ── Connection ──
  const handleDemoMode = () => {
    setDemoMode(true);
    setPhase('modeSelect');
  };

  const handleConnect = async () => {
    await scale.connect();
    // Only advance if actually connected (user didn't cancel picker)
  };

  // Auto-advance when scale connects
  useEffect(() => {
    if (scale.connected && phase === 'connect') {
      setPhase('modeSelect');
    }
  }, [scale.connected, phase]);

  const handleDisconnect = async () => {
    await scale.disconnect();
    setDemoMode(false);
    setWorkflowMode(null);
    setHarvestSession(null);
    setPhase('connect');
    clearSession();
  };

  // ── Mode Selection ──
  const handleSelectMode = (mode: WorkflowMode) => {
    setWorkflowMode(mode);
    setPhase(mode === 'dry' ? 'setup' : 'wetSetup');
  };

  // ── Dry Weight Handlers ──
  const handleAddStrain = (config: StrainConfig) => {
    setStrainConfigs(prev => [...prev, config]);
  };

  const handleStartWeighing = async () => {
    const newSessions: StrainSession[] = strainConfigs.map(config => ({
      config,
      readings: [],
      completed: false,
    }));
    setSessions(newSessions);
    setActiveSessionIndex(0);
    setPhase('weighing');
    await scale.startContinuous();
  };

  const handleRecordWeight = useCallback((reading: WeightReading) => {
    setSessions(prev => {
      const updated = [...prev];
      updated[activeSessionIndex] = {
        ...updated[activeSessionIndex],
        readings: [...updated[activeSessionIndex].readings, reading],
      };
      return updated;
    });
    if (demoMode) {
      demoTargetRef.current = 300 + Math.random() * 300;
      demoTickRef.current = 0;
    }
  }, [activeSessionIndex, demoMode]);

  const handleUpdateReadings = useCallback((readings: WeightReading[]) => {
    setSessions(prev => {
      const updated = [...prev];
      updated[activeSessionIndex] = {
        ...updated[activeSessionIndex],
        readings,
      };
      return updated;
    });
  }, [activeSessionIndex]);

  const handleSwitchStrain = useCallback((index: number) => {
    if (index < 0 || index >= sessions.length) return;
    setActiveSessionIndex(index);
  }, [sessions.length]);

  const handleFinishStrain = async () => {
    setSessions(prev => {
      const updated = [...prev];
      updated[activeSessionIndex] = {
        ...updated[activeSessionIndex],
        completed: true,
      };
      return updated;
    });

    if (activeSessionIndex < sessions.length - 1) {
      setActiveSessionIndex(prev => prev + 1);
    } else {
      await scale.stopContinuous();
      setPhase('summary');
    }
  };

  const handleExport = () => {
    exportExcel(sessions);
  };

  const handleNewSession = () => {
    setStrainConfigs([]);
    setSessions([]);
    setActiveSessionIndex(0);
    setPhase('modeSelect');
  };

  // ── Wet Weight Handlers ──
  const handleStartWetWeighing = async (config: HarvestBatchConfig, mode: SaveMode = 'local') => {
    const session: HarvestSession = { config, readings: [], completed: false };
    setHarvestSession(session);
    setSaveMode(mode);
    setPhase('wetWeighing');
    if (mode === 'cloud') {
      enqueueCloudOp({
        kind: 'pushHarvest',
        opId: crypto.randomUUID(),
        session,
        workflowMode: 'wet',
        deviceId: deviceIdRef.current,
      });
    }
    await scale.startContinuous();
  };

  const handleRecordPlant = useCallback((reading: WetWeightReading) => {
    setHarvestSession(prev => prev ? {
      ...prev,
      readings: [...prev.readings, reading],
    } : prev);
    // Reset demo to simulate next plant (new weight, settling first)
    if (demoMode) {
      demoTargetRef.current = 300 + Math.random() * 300;
      demoTickRef.current = 0;
    }
    // Fire-and-forget cloud push — never blocks capture.
    if (saveMode === 'cloud' && harvestSession) {
      enqueueCloudOp({
        kind: 'pushReadings',
        opId: crypto.randomUUID(),
        harvestId: harvestSession.config.id,
        readings: [reading],
        deviceId: deviceIdRef.current,
      });
    }
  }, [demoMode, saveMode, harvestSession]);

  const handleUpdateWetReadings = useCallback((readings: WetWeightReading[]) => {
    setHarvestSession(prev => prev ? { ...prev, readings } : prev);
  }, []);

  // Realtime merge — another device wrote a reading, append if we don't have it.
  const handleRemoteReading = useCallback((incoming: WetWeightReading) => {
    setHarvestSession(prev => {
      if (!prev) return prev;
      if (prev.readings.some(r => r.tagId === incoming.tagId)) return prev;
      return { ...prev, readings: [...prev.readings, incoming] };
    });
  }, []);

  useCloudHarvest({
    enabled: saveMode === 'cloud' && phase === 'wetWeighing',
    harvestId: harvestSession?.config.id ?? null,
    deviceId: deviceIdRef.current,
    onRemoteReading: handleRemoteReading,
  });

  const handleFinishHarvest = async () => {
    await scale.stopContinuous();
    setHarvestSession(prev => prev ? { ...prev, completed: true } : prev);
    setPhase('wetSummary');
    if (saveMode === 'cloud' && harvestSession) {
      enqueueCloudOp({
        kind: 'markCompleted',
        opId: crypto.randomUUID(),
        harvestId: harvestSession.config.id,
      });
    }
  };

  const handleWetExport = () => {
    if (harvestSession) exportWetExcel(harvestSession);
  };

  const handleLoadSession = async (session: HarvestSession) => {
    setHarvestSession(session);
    setPhase('wetWeighing');
    await scale.startContinuous();
  };

  const handleWetNewSession = () => {
    setHarvestSession(null);
    setPhase('modeSelect');
    clearSession();
  };

  const activeSession = sessions[activeSessionIndex];
  const isConnected = scale.connected || demoMode;

  const headerTitle = workflowMode === 'wet' ? 'SCALESYNC — HARVEST' : workflowMode === 'dry' ? 'SCALESYNC — VERIFY' : 'SCALESYNC';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — minimal top bar */}
      <header className={`px-4 py-2 flex justify-between items-center border-b transition-colors duration-500 ${
        !isConnected ? 'border-base-800 bg-base-950' :
        demoMode ? 'border-amber-500/20 bg-base-950' :
        workflowMode === 'wet' ? 'border-green-500/20 bg-base-950' : 'border-cyan-500/20 bg-base-950'
      }`}>
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className={`w-1.5 h-1.5 rounded-full ${
              demoMode ? 'bg-amber-400' : workflowMode === 'wet' ? 'bg-green-400' : 'bg-cyan-400'
            }`} />
          )}
          <span className="text-xs font-mono text-gray-500 uppercase tracking-[0.2em]">
            {headerTitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {phase === 'weighing' && activeSession && sessions.length > 1 && (
            <span className="text-[10px] font-mono text-gray-600">
              {activeSessionIndex + 1}/{sessions.length}
            </span>
          )}
          {demoMode && (
            <span className="text-[10px] font-mono text-amber-500/70 uppercase tracking-wider">Demo</span>
          )}
          <button
            onClick={() => setGuideOpen(true)}
            className="w-6 h-6 rounded-full border border-base-600 hover:border-gray-400 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors flex items-center justify-center"
            aria-label="Open user guide"
            title="User guide (?)"
          >
            ?
          </button>
        </div>
      </header>

      <UserGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Session Restored Toast */}
      {sessionRestored && (
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 text-center">
          <span className="text-xs font-medium text-green-400">Session restored from auto-save</span>
        </div>
      )}

      {/* Cloud resume list — active harvests started on any device */}
      {!cloudResumeDismissed && cloudResumeList.length > 0 && (phase === 'connect' || phase === 'modeSelect') && (
        <div className="bg-base-900/60 border-b border-base-700 px-4 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
              Cloud · {cloudResumeList.length} active harvest{cloudResumeList.length === 1 ? '' : 's'}
            </div>
            <button
              onClick={handleDismissCloudResume}
              className="text-[10px] text-gray-600 hover:text-gray-400 uppercase tracking-wider"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-1">
            {cloudResumeList.map(h => {
              const isThisDevice = h.device_id === deviceIdRef.current;
              return (
                <div key={h.id} className="flex items-center justify-between gap-3 text-xs text-gray-300 bg-base-800/60 border border-base-700 rounded px-2.5 py-1.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-medium truncate">{h.batch_name}</span>
                    <span className="font-mono text-gray-500 shrink-0">{h.recorded}/{h.total_plants}</span>
                    <span className="text-gray-600 shrink-0">started {formatTimeAgo(new Date(h.started_at))}</span>
                    {!isThisDevice && <span className="text-sky-400/70 text-[10px] shrink-0">other device</span>}
                  </div>
                  <button
                    onClick={() => handleResumeCloud(h.id)}
                    className="px-2.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium rounded transition-colors shrink-0"
                  >
                    Resume
                  </button>
                </div>
              );
            })}
          </div>
          {cloudLoadError && (
            <p className="text-[10px] text-red-400 mt-1">Load failed: {cloudLoadError}</p>
          )}
        </div>
      )}

      {/* Resume Pending Session Card */}
      {pendingResume && (phase === 'connect' || phase === 'modeSelect') && (
        <div className="bg-green-500/5 border-b border-green-500/20 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span className="text-xs text-gray-300 truncate">
              <span className="text-gray-500">Resume:</span>{' '}
              <span className="font-medium">{pendingResume.batchName}</span>{' '}
              <span className="text-gray-500 font-mono">
                {pendingResume.recorded}/{pendingResume.total}
              </span>
              <span className="text-gray-600 ml-2">
                saved {formatTimeAgo(new Date(pendingResume.savedAt))}
              </span>
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleResumeSession}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
            >
              Resume
            </button>
            <button
              onClick={handleDiscardResume}
              className="px-3 py-1 bg-base-800 hover:bg-base-700 border border-base-600 text-gray-400 text-xs rounded transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {phase === 'connect' && (
          <ScaleConnection
            connected={scale.connected}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onDemoMode={handleDemoMode}
            error={scale.error}
            onViewHistory={() => setPhase('history')}
            historyEnabled={cloudEnabled}
          />
        )}

        {phase === 'modeSelect' && (
          <ModeSelect
            onSelectMode={handleSelectMode}
            onDisconnect={handleDisconnect}
            demoMode={demoMode}
            onViewHistory={() => setPhase('history')}
            historyEnabled={cloudEnabled}
          />
        )}

        {phase === 'history' && (
          <HarvestHistory onBack={() => setPhase(scale.connected || demoMode ? 'modeSelect' : 'connect')} />
        )}

        {phase === 'setup' && (
          <SessionSetup
            onAddStrain={handleAddStrain}
            onStartWeighing={handleStartWeighing}
            strains={strainConfigs}
          />
        )}

        {phase === 'weighing' && activeSession && (
          <WeighingStation
            session={activeSession}
            sessions={sessions}
            activeSessionIndex={activeSessionIndex}
            onSwitchStrain={handleSwitchStrain}
            currentReading={demoMode ? demoReading : scale.currentReading}
            onRecordWeight={handleRecordWeight}
            onUpdateReadings={handleUpdateReadings}
            onFinishStrain={handleFinishStrain}
            onTare={demoMode ? async () => {} : scale.tare}
            onZero={demoMode ? async () => {} : scale.zero}
            onStartContinuous={demoMode ? async () => {} : scale.startContinuous}
            onStopContinuous={demoMode ? async () => {} : scale.stopContinuous}
          />
        )}

        {phase === 'summary' && (
          <VerificationSummary
            sessions={sessions}
            onExport={handleExport}
            onNewSession={handleNewSession}
          />
        )}

        {phase === 'wetSetup' && (
          <WetSetup
            onStartWeighing={handleStartWetWeighing}
            onLoadSession={handleLoadSession}
            onBack={() => setPhase('modeSelect')}
          />
        )}

        {phase === 'wetWeighing' && harvestSession && (
          <WetWeighingStation
            session={harvestSession}
            currentReading={demoMode ? demoReading : scale.currentReading}
            onRecordPlant={handleRecordPlant}
            onUpdateReadings={handleUpdateWetReadings}
            onFinish={handleFinishHarvest}
            onTare={demoMode ? async () => {} : scale.tare}
            onZero={demoMode ? async () => {} : scale.zero}
            onStartContinuous={demoMode ? async () => {} : scale.startContinuous}
            onStopContinuous={demoMode ? async () => {} : scale.stopContinuous}
            workflowMode={workflowMode ?? 'wet'}
            phase={phase}
            lastSavedAt={lastSavedAt}
          />
        )}

        {phase === 'wetSummary' && harvestSession && (
          <WetSummary
            session={harvestSession}
            onExport={handleWetExport}
            onNewSession={handleWetNewSession}
          />
        )}
      </main>
    </div>
  );
}

export default App;
