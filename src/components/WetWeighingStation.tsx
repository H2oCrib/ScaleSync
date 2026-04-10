import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScaleReading, HarvestSession, WetWeightReading } from '../lib/types';
import { GRAMS_PER_LB } from '../lib/types';
import { useAutoCapture } from '../hooks/useAutoCapture';
import { useAudio } from '../hooks/useAudio';

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
}: WetWeighingStationProps) {
  const [autoMode, setAutoMode] = useState(false);
  const [rapidMode, setRapidMode] = useState(false);
  const [continuousActive, setContinuousActive] = useState(false);
  const [scannedTag, setScannedTag] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedStrain, setSelectedStrain] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);
  const [awaitingWeight, setAwaitingWeight] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<WetWeightReading | null>(null);
  const [showControls, setShowControls] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { playCapture, playComplete, playError } = useAudio();

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

  // Re-focus scanner input
  useEffect(() => {
    if (!awaitingWeight || rapidMode) {
      const timer = setTimeout(() => scanInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [awaitingWeight, session.readings.length, rapidMode]);

  // In rapid mode, auto-enable auto-capture
  useEffect(() => {
    if (rapidMode) setAutoMode(true);
  }, [rapidMode]);

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
      // In rapid mode, re-focus scan input immediately
      if (rapidMode) {
        setTimeout(() => scanInputRef.current?.focus(), 50);
      }
    }
  }, [awaitingWeight, allDone, scannedTag, selectedStrain, nextPlant, totalPlants, onRecordPlant, playCapture, playComplete, rapidMode]);

  const { armed } = useAutoCapture({
    enabled: autoMode && awaitingWeight && !allDone,
    currentReading,
    onCapture: handleCapture,
  });

  const handleTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;

    const tag = tagInput.trim();

    // Duplicate check
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
  };

  const handleManualRecord = useCallback(() => {
    if (!currentReading || !awaitingWeight || autoMode) return;
    handleCapture(currentReading.weight);
  }, [currentReading, awaitingWeight, autoMode, handleCapture]);

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

  // Keyboard shortcuts (when not in scan input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;

      if ((e.key === 'Enter' || e.key === ' ') && awaitingWeight && !autoMode) {
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
  }, [handleManualRecord, awaitingWeight, autoMode, onTare]);

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
      {/* Header — compact on mobile */}
      <div className="flex justify-between items-start mb-2 sm:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-lg sm:text-2xl font-semibold text-gray-50 truncate">{session.config.batchName}</h2>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Plant {Math.min(nextPlant, totalPlants)} of {totalPlants}
            {!singleStrain && <> &middot; {session.config.strains.length} strains</>}
          </p>
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

      {/* Mode Toggle — Rapid vs Standard */}
      <div className="flex gap-2 mb-2 sm:mb-3">
        <button
          onClick={() => { setRapidMode(false); setAutoMode(false); }}
          className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
            !rapidMode
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-500'
          }`}
        >
          Standard
        </button>
        <button
          onClick={() => setRapidMode(true)}
          className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
            rapidMode
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-500'
          }`}
        >
          Rapid Scan
        </button>
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

      {/* ─── RAPID MODE LAYOUT ─── */}
      {rapidMode ? (
        <div className="space-y-2 sm:space-y-3">
          {/* Combined scan + weight display */}
          <div className="bg-base-900 border border-green-500/20 rounded-lg p-3 sm:p-4">
            {/* Scale readout — always visible in rapid mode */}
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

            {/* Scan input — always visible */}
            <form onSubmit={handleTagSubmit}>
              <input
                ref={scanInputRef}
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder={awaitingWeight ? 'Capturing weight...' : 'Scan METRC tag...'}
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
                {awaitingWeight && (
                  <span className={`text-[10px] sm:text-xs font-medium uppercase ${armed ? 'text-green-400' : 'text-gray-600'}`}>
                    {armed ? 'Armed' : 'Waiting for stable...'}
                  </span>
                )}
                {!awaitingWeight && !allDone && (
                  <span className="text-xs text-gray-600">Ready — scan next tag</span>
                )}
              </div>
              {awaitingWeight && (
                <button onClick={handleCancelTag} className="text-xs text-gray-600 hover:text-gray-400">
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Strain selector — compact pills for rapid mode */}
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

          {/* Compact totals row */}
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
        </div>
      ) : (
        /* ─── STANDARD MODE LAYOUT ─── */
        <>
          {/* Tag Scan Section */}
          {!awaitingWeight && !allDone && (
            <form onSubmit={handleTagSubmit} className="mb-2 sm:mb-4">
              <div className="bg-base-900 border border-green-500/20 rounded-lg p-3 sm:p-4">
                <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5 sm:mb-2">
                  Scan METRC Tag
                </label>
                <div className="flex gap-2">
                  <input
                    ref={!rapidMode ? scanInputRef : undefined}
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    placeholder="Scan barcode or type tag ID..."
                    className="flex-1 px-3 sm:px-4 py-3 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-base sm:text-lg"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!tagInput.trim()}
                    className="px-4 sm:px-5 py-3 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700 text-sm"
                  >
                    Submit
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] sm:text-xs text-gray-600">
                  Scanner will auto-submit on Enter. Manual entry supported.
                </p>
              </div>
            </form>
          )}

          {/* Tag Scanned — Awaiting Weight */}
          {awaitingWeight && scannedTag && (
            <div className="bg-base-900 border border-green-500/30 rounded-lg p-3 sm:p-4 mb-2 sm:mb-4">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Tag Scanned</p>
                  <p className="text-base sm:text-lg font-mono text-green-400 truncate">{scannedTag}</p>
                </div>
                <button
                  onClick={handleCancelTag}
                  className="px-2.5 sm:px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors shrink-0 ml-2"
                >
                  Cancel
                </button>
              </div>

              {/* Strain Selector */}
              {!singleStrain && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">
                    Assign to Strain
                  </label>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {strainCounts.map(sc => (
                      <button
                        key={sc.id}
                        onClick={() => setSelectedStrain(sc.strain)}
                        disabled={sc.remaining <= 0}
                        className={`px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors border ${
                          selectedStrain === sc.strain
                            ? 'bg-green-500/15 border-green-500/30 text-green-400'
                            : sc.remaining > 0
                              ? 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-400'
                              : 'bg-base-900 border-base-800 text-gray-700 cursor-not-allowed'
                        }`}
                      >
                        {sc.strain}
                        <span className="ml-1.5 text-[10px] sm:text-xs font-mono opacity-70">
                          {sc.weighed}/{sc.plantCount}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scale Readout */}
          <div className={`bg-base-900 border rounded-lg p-4 sm:p-6 mb-2 sm:mb-4 text-center transition-colors duration-300 ${
            isStable ? 'border-base-700' : 'border-amber-500/20'
          }`}>
            <div className="flex items-baseline justify-center">
              <span className="text-5xl sm:text-6xl font-mono font-light tabular-nums text-gray-50 transition-all duration-150">
                {displayWeight.toFixed(1)}
              </span>
              <span className="text-lg sm:text-xl font-mono font-light text-gray-500 ml-2">{displayUnit}</span>
            </div>
            <div className="mt-2 sm:mt-3 flex justify-center gap-4 items-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isStable ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className={`text-xs font-medium uppercase tracking-wider ${isStable ? 'text-green-400' : 'text-amber-400'}`}>
                  {isStable ? 'Stable' : 'Settling'}
                </span>
              </div>
              {autoMode && awaitingWeight && (
                <>
                  <span className="text-base-600">|</span>
                  <span className={`text-xs font-medium uppercase tracking-wider ${armed ? 'text-green-400' : 'text-gray-600'}`}>
                    {armed ? 'Armed' : 'Waiting'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 mb-2 sm:mb-4">
            {awaitingWeight && !allDone && (
              <>
                <button
                  onClick={handleManualRecord}
                  disabled={!currentReading || autoMode}
                  className="flex-1 py-3 sm:py-3 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 disabled:border-base-700 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700 text-sm"
                >
                  Record Weight
                </button>
                <button
                  onClick={() => setAutoMode(prev => !prev)}
                  className={`px-4 sm:px-5 py-3 rounded-lg font-medium transition-colors border text-sm ${
                    autoMode
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-400'
                  }`}
                >
                  Auto {autoMode ? 'ON' : 'OFF'}
                </button>
              </>
            )}
            <button
              onClick={handleUndoLast}
              disabled={session.readings.length === 0}
              className="px-3 sm:px-4 py-3 bg-base-800 hover:bg-base-700 disabled:bg-base-900 disabled:text-gray-700 disabled:border-base-800 text-gray-400 rounded-lg transition-colors border border-base-600 disabled:border-base-800 text-sm"
            >
              Undo
            </button>
          </div>

          {allDone && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-2 sm:mb-4 text-center">
              <p className="text-green-400 font-medium text-sm uppercase tracking-wider">
                All {totalPlants} plants weighed
              </p>
            </div>
          )}

          {/* Per-Strain Running Totals */}
          {session.readings.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-2 sm:mb-4">
              {strainCounts.map(sc => {
                const strainReadings = session.readings.filter(r => r.strain === sc.strain);
                const strainGrams = strainReadings.reduce((sum, r) => sum + r.weightGrams, 0);
                return (
                  <div key={sc.id} className="bg-base-900 border border-base-700 rounded-lg p-2.5 sm:p-3">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-400 truncate mb-0.5 sm:mb-1">{sc.strain}</p>
                    <p className="text-base sm:text-lg font-mono font-medium text-gray-100 tabular-nums">{strainGrams.toFixed(1)}<span className="text-[10px] sm:text-xs text-gray-500 ml-1">g</span></p>
                    <p className="text-[10px] font-mono text-gray-600">{sc.weighed}/{sc.plantCount} plants</p>
                  </div>
                );
              })}
              {/* Grand total */}
              <div className="bg-base-900 border border-green-500/20 rounded-lg p-2.5 sm:p-3">
                <p className="text-[10px] sm:text-xs font-medium text-green-400/70 mb-0.5 sm:mb-1">Total</p>
                <p className="text-base sm:text-lg font-mono font-medium text-gray-100 tabular-nums">{runningTotalGrams.toFixed(1)}<span className="text-[10px] sm:text-xs text-gray-500 ml-1">g</span></p>
                <p className="text-[10px] font-mono text-gray-600">{runningTotalLbs.toFixed(2)} lbs</p>
              </div>
            </div>
          )}

          {/* Recent Entries */}
          {session.readings.length > 0 && (
            <div className="bg-base-900 border border-base-700 rounded-lg overflow-hidden mb-2 sm:mb-4">
              <div className="bg-base-800 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-base-700">
                <h3 className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">
                  Recent Entries
                </h3>
              </div>
              <div className="max-h-36 sm:max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="sticky top-0 bg-base-900 border-b border-base-700">
                    <tr>
                      <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">#</th>
                      <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">Tag ID</th>
                      <th className="hidden sm:table-cell px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Strain</th>
                      <th className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...session.readings].reverse().slice(0, 20).map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}>
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-gray-400">{r.plantNumber}</td>
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-green-400/80 truncate max-w-[120px] sm:max-w-none">{r.tagId}</td>
                        <td className="hidden sm:table-cell px-4 py-1.5 text-gray-300">{r.strain}</td>
                        <td className="px-2 sm:px-4 py-1 sm:py-1.5 font-mono text-right text-gray-200">{r.weightGrams.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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
