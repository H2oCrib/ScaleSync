import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScaleReading, HarvestSession, WetWeightReading } from '../lib/types';
import { GRAMS_PER_LB } from '../lib/types';
import { useAutoCapture } from '../hooks/useAutoCapture';
import { useAudio } from '../hooks/useAudio';
import { useScannerRelay } from '../hooks/useScannerRelay';
import { useUSBScanner } from '../hooks/useUSBScanner';
import { exportSessionFile } from '../lib/session-persistence';

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

    if (nextPlant >= totalPlants) {
      playComplete();
    } else {
      playCapture();
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [awaitingWeight, allDone, scannedTag, selectedStrain, nextPlant, totalPlants, onRecordPlant, playCapture, playComplete]);

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
      {/* Header */}
      <div className="flex justify-between items-start mb-2 sm:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-lg sm:text-2xl font-semibold text-gray-50 truncate">{session.config.batchName}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
            <span>Plant {Math.min(nextPlant, totalPlants)} of {totalPlants}</span>
            {!singleStrain && <><span>&middot;</span><span>{session.config.strains.length} strains</span></>}
            <span>&middot;</span>
            <span className={`flex items-center gap-1 ${currentReading ? 'text-green-500' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${currentReading ? 'bg-green-500' : 'bg-gray-600'}`} />
              Scale
            </span>
            <span className={`flex items-center gap-1 ${usbScannerConnected ? 'text-green-500' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${usbScannerConnected ? 'bg-green-500' : 'bg-gray-600'}`} />
              Scanner
            </span>
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

      {/* Finish Button */}
      <div className="mt-2 sm:mt-4">
        <button
          onClick={onFinish}
          className={`w-full py-3 font-medium rounded-lg transition-colors border text-sm ${
            allDone
              ? 'bg-green-600 hover:bg-green-500 text-white border-green-500/30'
              : 'bg-base-800 hover:bg-base-700 text-gray-400 border-base-600'
          }`}
        >
          Finish Harvest {!allDone && `(${session.readings.length}/${totalPlants})`}
        </button>
      </div>
    </div>
  );
}
