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
import { exportExcel } from './lib/export';
import { exportWetExcel } from './lib/wet-export';
import { loadSession, clearSession, createDebouncedSave } from './lib/session-persistence';
import type {
  AppPhase, ScaleReading, StrainConfig, StrainSession, WeightReading,
  WorkflowMode, HarvestBatchConfig, HarvestSession, WetWeightReading,
} from './lib/types';

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

  const debouncedSave = useMemo(() => createDebouncedSave(300), []);

  // Restore saved session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setHarvestSession(saved.harvestSession);
      setWorkflowMode(saved.workflowMode);
      setPhase(saved.phase);
      setDemoMode(true); // restored sessions run in demo (no scale connection yet)
      setSessionRestored(true);
      setTimeout(() => setSessionRestored(false), 4000);
    }
  }, []);

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
    setPhase('modeSelect');
  };

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
  const handleStartWetWeighing = async (config: HarvestBatchConfig) => {
    setHarvestSession({ config, readings: [], completed: false });
    setPhase('wetWeighing');
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
  }, [demoMode]);

  const handleUpdateWetReadings = useCallback((readings: WetWeightReading[]) => {
    setHarvestSession(prev => prev ? { ...prev, readings } : prev);
  }, []);

  const handleFinishHarvest = async () => {
    await scale.stopContinuous();
    setHarvestSession(prev => prev ? { ...prev, completed: true } : prev);
    setPhase('wetSummary');
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

  const headerTitle = workflowMode === 'wet' ? 'WET WEIGHT HARVEST' : 'WEIGHT VERIFICATION';

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
        </div>
      </header>

      {/* Session Restored Toast */}
      {sessionRestored && (
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 text-center">
          <span className="text-xs font-medium text-green-400">Session restored from auto-save</span>
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
          />
        )}

        {phase === 'modeSelect' && (
          <ModeSelect
            onSelectMode={handleSelectMode}
            onDisconnect={handleDisconnect}
            demoMode={demoMode}
          />
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
