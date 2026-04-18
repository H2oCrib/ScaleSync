import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScaleReading, HarvestSession, WetWeightReading } from '../lib/types';
import { GRAMS_PER_LB } from '../lib/types';
import { useAutoCapture } from '../hooks/useAutoCapture';
import { useAudio } from '../hooks/useAudio';
import { useScannerRelay } from '../hooks/useScannerRelay';
import { useUSBScanner } from '../hooks/useUSBScanner';
import { exportSessionFile } from '../lib/session-persistence';
import { formatTimeAgo } from '../App';

interface WetWeighingStationProps {
  session: HarvestSession;
  currentReading: ScaleReading | null;
  onRecordPlant: (reading: WetWeightReading) => void;
  onUpdateReadings: (readings: WetWeightReading[]) => void;
  onFinish: () => void;
  onTare: () => void;
  onZero: () => void;
  onStartContinuous: () => void;
  onStopContinuous: () => void;
  workflowMode: 'dry' | 'wet';
  phase: string;
  lastSavedAt?: Date | null;
}

export function WetWeighingStation({
  session,
  currentReading,
  onRecordPlant,
  onUpdateReadings,
  onFinish,
  onTare,
  onZero,
  onStartContinuous,
  onStopContinuous,
  workflowMode,
  phase,
  lastSavedAt,
}: WetWeighingStationProps) {
  const [autoCapture, setAutoCapture] = useState(true);
  const [continuousActive, setContinuousActive] = useState(false);
  const [scannedTag, setScannedTag] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedStrain, setSelectedStrain] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);
  const [awaitingWeight, setAwaitingWeight] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<WetWeightReading | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ tagId: string; strain: string; weightGrams: string }>({ tagId: '', strain: '', weightGrams: '' });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [, setTimeTick] = useState(0);
  type FlashState =
    | { kind: 'success'; strain: string; plantNumber: number; total: number; weightGrams: number }
    | { kind: 'error'; tagId: string }
    | null;
  const [flash, setFlash] = useState<FlashState>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFlash = useCallback((state: Exclude<FlashState, null>) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(state);
    flashTimerRef.current = setTimeout(
      () => setFlash(null),
      state.kind === 'success' ? 1100 : 550,
    );
  }, []);

  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  // Tick every 15s to refresh "saved Xs ago" / ETA labels
  useEffect(() => {
    const id = setInterval(() => setTimeTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const startEditing = (r: WetWeightReading) => {
    setEditingId(r.id);
    setEditValues({ tagId: r.tagId, strain: r.strain, weightGrams: r.weightGrams.toFixed(1) });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const weight = parseFloat(editValues.weightGrams);
    if (isNaN(weight) || weight <= 0 || !editValues.tagId.trim()) return;
    const updated = session.readings.map(r =>
      r.id === editingId
        ? { ...r, tagId: editValues.tagId.trim(), strain: editValues.strain, weightGrams: Math.round(weight * 10) / 10 }
        : r
    );
    onUpdateReadings(updated);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const deleteReading = (id: string) => {
    const updated = session.readings.filter(r => r.id !== id);
    const renumbered = updated.map((r, i) => ({ ...r, plantNumber: i + 1 }));
    onUpdateReadings(renumbered);
    setEditingId(null);
  };

  const scanInputRef = useRef<HTMLInputElement>(null);
  const { playCapture, playComplete, playError } = useAudio();

  // Scanner relay ref — set after useAutoCapture so resetAutoCapture is available
  const relayTagHandlerRef = useRef<(tagId: string) => void>(() => {});

  const { connected: scannerRelayConnected } = useScannerRelay({
    enabled: true,
    onTagReceived: (tagId: string) => relayTagHandlerRef.current(tagId),
  });

  const { connected: usbScannerConnected } = useUSBScanner({
    inputRef: scanInputRef,
    onScan: () => {},
    enabled: true,
  });

  // ── Tab Protection ──

  // Warn before closing/refreshing tab during active session
  useEffect(() => {
    if (session.readings.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [session.readings.length]);

  // Wake Lock — prevent device sleep during long sessions
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Wake Lock API not supported or denied — silent
      }
    };
    requestWakeLock();

    // Re-acquire on visibility change (released when tab goes hidden)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLock?.release();
    };
  }, []);

  // Keep-alive ping — prevent browser from discarding background tab
  useEffect(() => {
    const interval = setInterval(() => {
      // Trivial operation to keep JS context alive
      void document.hidden;
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const totalPlants = session.config.strains.reduce((sum, s) => sum + s.plantCount, 0);
  const nextPlant = session.readings.length + 1;
  const allDone = nextPlant > totalPlants;
  const progress = session.readings.length / totalPlants;
  const singleStrain = session.config.strains.length === 1;

  // Per-strain counts
  const strainCounts = session.config.strains.map(sc => {
    const weighed = session.readings.filter(r => r.strain === sc.strain).length;
    return { ...sc, weighed, remaining: sc.plantCount - weighed };
  });

  // Running totals
  const runningTotalGrams = session.readings.reduce((sum, r) => sum + r.weightGrams, 0);
  const runningTotalLbs = runningTotalGrams / GRAMS_PER_LB;

  // Pace / ETA — use last 30 readings as rolling window so early-session spikes don't skew
  let paceLabel = '—';
  let etaLabel = '—';
  if (session.readings.length >= 2) {
    const window = session.readings.slice(-30);
    const first = new Date(window[0].timestamp).getTime();
    const last = new Date(window[window.length - 1].timestamp).getTime();
    const spanMin = Math.max((last - first) / 60000, 0.01);
    const perMin = (window.length - 1) / spanMin;
    const perHr = perMin * 60;
    paceLabel = perHr >= 10 ? `${perHr.toFixed(0)}/hr` : `${perHr.toFixed(1)}/hr`;
    const remaining = totalPlants - session.readings.length;
    if (remaining > 0 && perMin > 0) {
      const etaMin = remaining / perMin;
      if (etaMin < 1) etaLabel = '<1m';
      else if (etaMin < 60) etaLabel = `${Math.round(etaMin)}m`;
      else {
        const h = Math.floor(etaMin / 60);
        const m = Math.round(etaMin % 60);
        etaLabel = `${h}h${m ? ` ${m}m` : ''}`;
      }
    } else if (remaining === 0) {
      etaLabel = 'done';
    }
  }

  // Auto-select first strain with remaining plants
  useEffect(() => {
    if (!selectedStrain || strainCounts.find(s => s.strain === selectedStrain)?.remaining === 0) {
      const firstWithRemaining = strainCounts.find(s => s.remaining > 0);
      if (firstWithRemaining) setSelectedStrain(firstWithRemaining.strain);
    }
  }, [session.readings.length]);

  // Re-focus scanner input after capture or when not awaiting weight
  useEffect(() => {
    if (!awaitingWeight) {
      const timer = setTimeout(() => scanInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [awaitingWeight, session.readings.length]);

  const handleCapture = useCallback((weight: number) => {
    if (!awaitingWeight || allDone || !scannedTag) return;

    const reading: WetWeightReading = {
      id: crypto.randomUUID(),
      tagId: scannedTag,
      strain: selectedStrain,
      weightGrams: Math.round(weight * 10) / 10,
      timestamp: new Date(),
      plantNumber: nextPlant,
    };
    onRecordPlant(reading);
    setLastRecorded(reading);
    setScannedTag('');
    setAwaitingWeight(false);
    triggerFlash({
      kind: 'success',
      strain: reading.strain,
      plantNumber: reading.plantNumber,
      total: totalPlants,
      weightGrams: reading.weightGrams,
    });

    if (nextPlant >= totalPlants) {
      playComplete();
    } else {
      playCapture();
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [awaitingWeight, allDone, scannedTag, selectedStrain, nextPlant, totalPlants, onRecordPlant, playCapture, playComplete, triggerFlash]);

  const { armed, reset: resetAutoCapture } = useAutoCapture({
    enabled: autoCapture && awaitingWeight && !allDone,
    currentReading,
    onCapture: handleCapture,
  });

  // Update relay handler now that resetAutoCapture is available
  relayTagHandlerRef.current = (tagId: string) => {
    const isDuplicate = session.readings.some(r => r.tagId === tagId);
    if (isDuplicate) {
      setDuplicateAlert(tagId);
      playError();
      triggerFlash({ kind: 'error', tagId });
      setTimeout(() => setDuplicateAlert(null), 3000);
      return;
    }
    setScannedTag(tagId);
    setTagInput('');
    setAwaitingWeight(true);
    setDuplicateAlert(null);
    resetAutoCapture();
  };

  const handleTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;

    const tag = tagInput.trim();
    const isDuplicate = session.readings.some(r => r.tagId === tag);
    if (isDuplicate) {
      setDuplicateAlert(tag);
      playError();
      triggerFlash({ kind: 'error', tagId: tag });
      setTagInput('');
      setTimeout(() => setDuplicateAlert(null), 3000);
      return;
    }

    setScannedTag(tag);
    setTagInput('');
    setAwaitingWeight(true);
    setDuplicateAlert(null);
    resetAutoCapture();
  };

  // Manual capture via Space/Enter
  const handleManualRecord = useCallback(() => {
    if (!currentReading || !awaitingWeight) return;
    handleCapture(currentReading.weight);
  }, [currentReading, awaitingWeight, handleCapture]);

  const handleCancelTag = () => {
    setScannedTag('');
    setAwaitingWeight(false);
    scanInputRef.current?.focus();
  };

  const handleUndoLast = () => {
    if (session.readings.length === 0) return;
    onUpdateReadings(session.readings.slice(0, -1));
    setAwaitingWeight(false);
    setScannedTag('');
    setLastRecorded(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;

      if ((e.key === 'Enter' || e.key === ' ') && awaitingWeight) {
        e.preventDefault();
        handleManualRecord();
      }
      if (e.key === 'z' && !e.ctrlKey && !e.metaKey) {
        handleUndoLast();
      }
      if (e.key === 't') onTare();
      if (e.key === 'Escape') handleCancelTag();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualRecord, awaitingWeight, onTare]);

  const toggleContinuous = async () => {
    if (continuousActive) {
      await onStopContinuous();
      setContinuousActive(false);
    } else {
      await onStartContinuous();
      setContinuousActive(true);
    }
  };

  const displayWeight = currentReading?.weight ?? 0;
  const displayUnit = currentReading?.unit ?? 'g';
  const isStable = currentReading?.stable ?? false;

  return (
    <div className="max-w-5xl mx-auto py-2 sm:py-4 px-2 sm:px-4">
      {/* Full-screen capture flash — green for success (with strain/count), red for duplicate */}
      {flash && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 pointer-events-none z-40 flex items-center justify-center ${
            flash.kind === 'success'
              ? 'bg-green-500/30 motion-safe:animate-flash-success'
              : 'bg-red-500/35 motion-safe:animate-flash-error'
          }`}
        >
          {flash.kind === 'success' && (
            <div className="motion-safe:animate-flash-content text-center px-6 py-5 bg-green-600/90 backdrop-blur-sm border-2 border-green-400 rounded-2xl shadow-2xl">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.25em] text-green-100/80 mb-1">Recorded</p>
              <p className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-1 truncate max-w-[80vw]">
                {flash.strain}
              </p>
              <p className="text-base sm:text-xl font-mono text-white/90 tabular-nums">
                {flash.plantNumber} / {flash.total}
              </p>
              <p className="text-xs sm:text-sm font-mono text-green-100/80 mt-1">
                {flash.weightGrams.toFixed(1)} g
              </p>
            </div>
          )}
          {flash.kind === 'error' && (
            <div className="motion-safe:animate-flash-content text-center px-5 py-3 bg-red-600/90 backdrop-blur-sm border-2 border-red-400 rounded-xl shadow-2xl">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.25em] text-red-100/80 mb-0.5">Duplicate</p>
              <p className="text-sm sm:text-base font-mono text-white truncate max-w-[70vw]">{flash.tagId}</p>
            </div>
          )}
        </div>
      )}
      {/* Header */}
      <div className="flex justify-between items-start mb-2 sm:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-lg sm:text-2xl font-semibold text-gray-50 truncate">{session.config.batchName}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono flex-wrap">
            <span>Plant {Math.min(nextPlant, totalPlants)} of {totalPlants}</span>
            {!singleStrain && <><span>&middot;</span><span>{session.config.strains.length} strains</span></>}
            {session.readings.length >= 2 && (
              <>
                <span>&middot;</span>
                <span title="Recent pace">{paceLabel}</span>
                <span>&middot;</span>
                <span title="Estimated time remaining" className={etaLabel === 'done' ? 'text-green-400' : ''}>
                  ETA {etaLabel}
                </span>
              </>
            )}
            <span>&middot;</span>
            <span className={`flex items-center gap-1 ${currentReading ? 'text-green-500' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${currentReading ? 'bg-green-500' : 'bg-gray-600'}`} />
              Scale
            </span>
            <span className={`flex items-center gap-1 ${usbScannerConnected ? 'text-green-500' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${usbScannerConnected ? 'bg-green-500' : 'bg-gray-600'}`} />
              Scanner
            </span>
            {lastSavedAt && (
              <>
                <span>&middot;</span>
                <span className="text-gray-600" title={`Last auto-save: ${lastSavedAt.toLocaleTimeString()}`}>
                  Saved {formatTimeAgo(lastSavedAt)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setShowControls(v => !v)}
            className="sm:hidden px-2.5 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400"
          >
            {showControls ? 'Hide' : 'Controls'}
          </button>
          <div className={`${showControls ? 'flex' : 'hidden'} sm:flex gap-1.5 sm:gap-2`}>
            <button onClick={onTare} className="px-2.5 sm:px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors">
              TARE
            </button>
            <button onClick={onZero} className="px-2.5 sm:px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors">
              ZERO
            </button>
            <button
              onClick={toggleContinuous}
              className={`px-2.5 sm:px-3 py-1.5 border rounded text-xs transition-colors ${
                continuousActive
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-400'
              }`}
            >
              {continuousActive ? 'STOP' : 'STREAM'}
            </button>
            <button
              onClick={() => exportSessionFile(session, workflowMode, phase as any)}
              disabled={session.readings.length === 0}
              className="px-2.5 sm:px-3 py-1.5 bg-base-800 hover:bg-base-700 disabled:bg-base-900 disabled:text-gray-700 border border-base-600 disabled:border-base-800 rounded text-xs text-gray-400 transition-colors"
              title="Save progress to file"
            >
              SAVE
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2 sm:mb-4">
        <div className="flex justify-between items-center mb-0.5 sm:mb-1">
          <span className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">Progress</span>
          <span className="text-[10px] sm:text-xs font-mono text-gray-400">{session.readings.length}/{totalPlants}</span>
        </div>
        <div className="h-1 sm:h-1.5 bg-base-800 rounded-full overflow-hidden border border-base-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-green-500/70'}`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Duplicate Alert */}
      {duplicateAlert && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 sm:p-3 mb-2 sm:mb-4 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-red-400 text-xs sm:text-sm font-medium truncate">
            Duplicate: <span className="font-mono">{duplicateAlert}</span>
          </span>
        </div>
      )}

      <div className="space-y-2 sm:space-y-3">
        {/* Scale readout + scan input */}
        <div className="bg-base-900 border border-green-500/20 rounded-lg p-3 sm:p-4">
          {/* Weight display */}
          <div className="flex items-baseline justify-center mb-3">
            <span className="text-4xl sm:text-5xl font-mono font-light tabular-nums text-gray-50">
              {displayWeight.toFixed(1)}
            </span>
            <span className="text-lg font-mono font-light text-gray-500 ml-2">{displayUnit}</span>
            <div className="ml-3 flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isStable ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className={`text-[10px] sm:text-xs font-medium uppercase ${isStable ? 'text-green-400' : 'text-amber-400'}`}>
                {isStable ? 'Stable' : '...'}
              </span>
            </div>
          </div>

          {/* Scan input */}
          <form onSubmit={handleTagSubmit}>
            <input
              ref={scanInputRef}
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder={awaitingWeight ? 'Capturing weight... (Space/Enter to record now)' : 'Scan METRC tag or type ID...'}
              disabled={awaitingWeight}
              className="w-full px-3 sm:px-4 py-3 sm:py-4 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-base sm:text-lg text-center disabled:opacity-50 disabled:cursor-wait"
              autoFocus
            />
          </form>

          {/* Status line */}
          <div className="mt-2 flex justify-between items-center">
            <div className="flex items-center gap-2">
              {awaitingWeight && scannedTag && (
                <span className="text-xs font-mono text-green-400 truncate max-w-[150px] sm:max-w-none">
                  {scannedTag}
                </span>
              )}
              {awaitingWeight && autoCapture && (
                <span className={`text-[10px] sm:text-xs font-medium uppercase ${armed ? 'text-green-400' : 'text-gray-600'}`}>
                  {armed ? 'Armed' : 'Stabilizing...'}
                </span>
              )}
              {awaitingWeight && !autoCapture && (
                <span className="text-[10px] sm:text-xs font-medium uppercase text-gray-600">
                  Press Space/Enter to record
                </span>
              )}
              {!awaitingWeight && !allDone && (
                <span className="text-xs text-gray-600">Scan next tag to begin</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {awaitingWeight && (
                <>
                  <button
                    onClick={handleManualRecord}
                    disabled={!currentReading}
                    className="text-xs text-green-500 hover:text-green-400 disabled:text-gray-700 font-medium"
                  >
                    Record Now
                  </button>
                  <button onClick={handleCancelTag} className="text-xs text-gray-600 hover:text-gray-400">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Auto-capture toggle */}
          <div className="mt-2 flex items-center justify-center">
            <button
              onClick={() => setAutoCapture(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                autoCapture
                  ? 'bg-green-500/15 border-green-500/30 text-green-400'
                  : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-500'
              }`}
            >
              Auto-Capture {autoCapture ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Strain selector pills */}
        {!singleStrain && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {strainCounts.map(sc => (
              <button
                key={sc.id}
                onClick={() => setSelectedStrain(sc.strain)}
                disabled={sc.remaining <= 0}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
                  selectedStrain === sc.strain
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : sc.remaining > 0
                      ? 'bg-base-800 border-base-600 text-gray-400'
                      : 'bg-base-900 border-base-800 text-gray-700 cursor-not-allowed'
                }`}
              >
                {sc.strain}
                <span className="ml-1.5 text-[10px] sm:text-xs font-mono opacity-70">{sc.weighed}/{sc.plantCount}</span>
              </button>
            ))}
          </div>
        )}

        {/* Last recorded confirmation + undo */}
        {lastRecorded && (
          <div className="flex items-center justify-between bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs text-green-400/80 font-mono truncate">
                #{lastRecorded.plantNumber} {lastRecorded.tagId.slice(-8)}
              </span>
              <span className="text-xs text-gray-500 font-mono">{lastRecorded.weightGrams.toFixed(1)}g</span>
              <span className="text-xs text-gray-600">{lastRecorded.strain}</span>
            </div>
            <button
              onClick={handleUndoLast}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors shrink-0 ml-2"
            >
              Undo
            </button>
          </div>
        )}

        {allDone && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
            <p className="text-green-400 font-medium text-sm uppercase tracking-wider">
              All {totalPlants} plants weighed
            </p>
          </div>
        )}

        {/* Strain totals */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {strainCounts.map(sc => {
            const strainGrams = session.readings.filter(r => r.strain === sc.strain).reduce((sum, r) => sum + r.weightGrams, 0);
            return (
              <div key={sc.id} className="bg-base-900 border border-base-700 rounded-lg px-2.5 sm:px-3 py-2 shrink-0">
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 truncate">{sc.strain}</p>
                <p className="text-sm sm:text-base font-mono text-gray-100 tabular-nums">{strainGrams.toFixed(0)}<span className="text-[10px] text-gray-500 ml-0.5">g</span></p>
                <p className="text-[10px] font-mono text-gray-600">{sc.weighed}/{sc.plantCount}</p>
              </div>
            );
          })}
          <div className="bg-base-900 border border-green-500/20 rounded-lg px-2.5 sm:px-3 py-2 shrink-0">
            <p className="text-[10px] sm:text-xs font-medium text-green-400/70">Total</p>
            <p className="text-sm sm:text-base font-mono text-gray-100 tabular-nums">{runningTotalGrams.toFixed(0)}<span className="text-[10px] text-gray-500 ml-0.5">g</span></p>
            <p className="text-[10px] font-mono text-gray-600">{runningTotalLbs.toFixed(2)} lbs</p>
          </div>
        </div>

        {/* Recent Entries — click row to edit */}
        {session.readings.length > 0 && (
          <div className="bg-base-900 border border-base-700 rounded-lg overflow-hidden">
            <div className="bg-base-800 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-base-700 flex justify-between items-center">
              <h3 className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">
                Entries
              </h3>
              <span className="text-[10px] text-gray-600">Click row to edit</span>
            </div>
            <div className="max-h-48 sm:max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 bg-base-900 border-b border-base-700">
                  <tr>
                    <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">#</th>
                    <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">Tag ID</th>
                    <th className="hidden sm:table-cell px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Strain</th>
                    <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weight</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...session.readings].reverse().slice(0, 30).map((r, i) => (
                    editingId === r.id ? (
                      <tr key={r.id} className="bg-green-500/5 border-y border-green-500/20">
                        <td className="px-2 sm:px-4 py-1.5 font-mono text-gray-400">{r.plantNumber}</td>
                        <td className="px-1 sm:px-2 py-1">
                          <input
                            type="text"
                            value={editValues.tagId}
                            onChange={e => setEditValues(v => ({ ...v, tagId: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            className="w-full px-1.5 py-0.5 bg-base-800 border border-green-500/30 rounded text-green-400 font-mono text-xs focus:outline-none focus:border-green-500/60"
                            autoFocus
                          />
                        </td>
                        <td className="hidden sm:table-cell px-2 py-1">
                          <select
                            value={editValues.strain}
                            onChange={e => setEditValues(v => ({ ...v, strain: e.target.value }))}
                            className="w-full px-1.5 py-0.5 bg-base-800 border border-green-500/30 rounded text-gray-300 text-xs focus:outline-none focus:border-green-500/60"
                          >
                            {session.config.strains.map(s => (
                              <option key={s.id} value={s.strain}>{s.strain}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 sm:px-2 py-1 text-right">
                          <input
                            type="number"
                            step="0.1"
                            value={editValues.weightGrams}
                            onChange={e => setEditValues(v => ({ ...v, weightGrams: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            className="w-16 sm:w-20 px-1.5 py-0.5 bg-base-800 border border-green-500/30 rounded text-gray-200 font-mono text-xs text-right focus:outline-none focus:border-green-500/60"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex gap-1">
                            <button onClick={saveEdit} className="text-green-400 hover:text-green-300 text-xs" title="Save">&#10003;</button>
                            <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-300 text-xs" title="Cancel">&#10005;</button>
                            <button onClick={() => deleteReading(r.id)} className="text-red-500/50 hover:text-red-400 text-xs" title="Delete">&#128465;</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={r.id}
                        onClick={() => startEditing(r)}
                        className={`cursor-pointer hover:bg-base-700/50 transition-colors ${i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}`}
                      >
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-gray-400">{r.plantNumber}</td>
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-green-400/80 truncate max-w-[120px] sm:max-w-none">{r.tagId}</td>
                        <td className="hidden sm:table-cell px-4 py-1.5 text-gray-300">{r.strain}</td>
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-right text-gray-200">{r.weightGrams.toFixed(1)}</td>
                        <td></td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Shortcuts hint strip */}
      <div className="mt-3 sm:mt-4">
        <button
          onClick={() => setShowShortcuts(v => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-base-900 hover:bg-base-800 border border-base-700 rounded text-[10px] sm:text-xs text-gray-500 transition-colors"
          aria-expanded={showShortcuts}
        >
          <span className="uppercase tracking-widest">Keyboard Shortcuts</span>
          <span>{showShortcuts ? '▲' : '▼'}</span>
        </button>
        {showShortcuts && (
          <div className="mt-1 px-3 py-2 bg-base-900/60 border border-base-700/60 rounded text-[10px] sm:text-xs text-gray-500 grid grid-cols-2 sm:grid-cols-5 gap-y-1 gap-x-3 font-mono">
            <span><kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">Space</kbd> / <kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">Enter</kbd> record</span>
            <span><kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">Z</kbd> undo last</span>
            <span><kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">T</kbd> tare</span>
            <span><kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">Esc</kbd> cancel tag</span>
            <span><kbd className="px-1 py-0.5 bg-base-800 border border-base-600 rounded text-gray-400">?</kbd> user guide</span>
          </div>
        )}
      </div>

      {/* Finish Button */}
      <div className="mt-2 sm:mt-4">
        <button
          onClick={() => setConfirmFinish(true)}
          className={`w-full py-3 font-medium rounded-lg transition-colors border text-sm ${
            allDone
              ? 'bg-green-600 hover:bg-green-500 text-white border-green-500/30'
              : 'bg-base-800 hover:bg-base-700 text-gray-400 border-base-600'
          }`}
        >
          Finish Harvest {!allDone && `(${session.readings.length}/${totalPlants})`}
        </button>
      </div>

      {/* Finish Confirmation Modal */}
      {confirmFinish && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setConfirmFinish(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-base-900 border border-base-700 rounded-lg p-5 sm:p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base sm:text-lg font-semibold text-gray-100 mb-1">
              Finish harvest?
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              {allDone
                ? 'All plants weighed. This will lock the session and open the summary.'
                : `Only ${session.readings.length} of ${totalPlants} plants recorded. You can still come back if you finish early.`}
            </p>
            <div className="bg-base-800 border border-base-700 rounded p-3 mb-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600">Plants</p>
                <p className="text-sm font-mono text-gray-200">{session.readings.length}/{totalPlants}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600">Total</p>
                <p className="text-sm font-mono text-gray-200">{runningTotalGrams.toFixed(0)}g</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600">Lbs</p>
                <p className="text-sm font-mono text-gray-200">{runningTotalLbs.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmFinish(false)}
                className="flex-1 py-2.5 bg-base-800 hover:bg-base-700 border border-base-600 text-gray-300 text-sm rounded transition-colors"
              >
                Keep Weighing
              </button>
              <button
                onClick={() => { setConfirmFinish(false); onFinish(); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded transition-colors border ${
                  allDone
                    ? 'bg-green-600 hover:bg-green-500 text-white border-green-500/30'
                    : 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/30'
                }`}
              >
                {allDone ? 'Finish' : 'Finish Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
