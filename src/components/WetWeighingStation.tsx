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
  const [continuousActive, setContinuousActive] = useState(false);
  const [scannedTag, setScannedTag] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedStrain, setSelectedStrain] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);
  const [awaitingWeight, setAwaitingWeight] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { playCapture, playComplete, playError } = useAudio();

  const totalPlants = session.config.strains.reduce((sum, s) => sum + s.plantCount, 0);
  const nextPlant = session.readings.length + 1;
  const allDone = nextPlant > totalPlants;
  const progress = session.readings.length / totalPlants;

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
    setScannedTag('');
    setAwaitingWeight(false);

    if (nextPlant >= totalPlants) {
      playComplete();
    } else {
      playCapture();
    }
  }, [awaitingWeight, allDone, scannedTag, selectedStrain, nextPlant, totalPlants, onRecordPlant, playCapture, playComplete]);

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
    <div className="max-w-5xl mx-auto py-4 px-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Harvesting</p>
          <h2 className="text-2xl font-semibold text-gray-50">{session.config.batchName}</h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Plant {Math.min(nextPlant, totalPlants)} of {totalPlants}
            {' '}&middot;{' '}
            {session.config.strains.length} strain{session.config.strains.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onTare} className="px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors">
            TARE <span className="text-gray-600 ml-1">T</span>
          </button>
          <button onClick={onZero} className="px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors">
            ZERO
          </button>
          <button
            onClick={toggleContinuous}
            className={`px-3 py-1.5 border rounded text-xs transition-colors ${
              continuousActive
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-400'
            }`}
          >
            {continuousActive ? 'STREAMING' : 'STREAM'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium uppercase tracking-widest text-gray-500">Progress</span>
          <span className="text-xs font-mono text-gray-400">{session.readings.length}/{totalPlants}</span>
        </div>
        <div className="h-1.5 bg-base-800 rounded-full overflow-hidden border border-base-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-green-500/70'}`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Duplicate Alert */}
      {duplicateAlert && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-400 text-sm font-medium">
            Duplicate tag detected: <span className="font-mono">{duplicateAlert}</span>
          </span>
        </div>
      )}

      {/* Tag Scan Section */}
      {!awaitingWeight && !allDone && (
        <form onSubmit={handleTagSubmit} className="mb-4">
          <div className="bg-base-900 border border-green-500/20 rounded-lg p-4">
            <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-2">
              Scan METRC Tag
            </label>
            <div className="flex gap-2">
              <input
                ref={scanInputRef}
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="Scan barcode or type tag ID..."
                className="flex-1 px-4 py-3 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-lg"
                autoFocus
              />
              <button
                type="submit"
                disabled={!tagInput.trim()}
                className="px-5 py-3 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700 text-sm"
              >
                Submit
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Scanner will auto-submit on Enter. Manual entry supported.
            </p>
          </div>
        </form>
      )}

      {/* Tag Scanned — Awaiting Weight */}
      {awaitingWeight && scannedTag && (
        <div className="bg-base-900 border border-green-500/30 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Tag Scanned</p>
              <p className="text-lg font-mono text-green-400">{scannedTag}</p>
            </div>
            <button
              onClick={handleCancelTag}
              className="px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors"
            >
              Cancel <span className="text-gray-600 ml-1">Esc</span>
            </button>
          </div>

          {/* Strain Selector */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">
              Assign to Strain
            </label>
            <div className="flex flex-wrap gap-2">
              {strainCounts.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => setSelectedStrain(sc.strain)}
                  disabled={sc.remaining <= 0}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    selectedStrain === sc.strain
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : sc.remaining > 0
                        ? 'bg-base-800 hover:bg-base-700 border-base-600 text-gray-400'
                        : 'bg-base-900 border-base-800 text-gray-700 cursor-not-allowed'
                  }`}
                >
                  {sc.strain}
                  <span className="ml-2 text-xs font-mono opacity-70">
                    {sc.weighed}/{sc.plantCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Scale Readout */}
      <div className={`bg-base-900 border rounded-lg p-6 mb-4 text-center transition-colors duration-300 ${
        isStable ? 'border-base-700' : 'border-amber-500/20'
      }`}>
        <div className="flex items-baseline justify-center">
          <span className="text-6xl font-mono font-light tabular-nums text-gray-50 transition-all duration-150">
            {displayWeight.toFixed(1)}
          </span>
          <span className="text-xl font-mono font-light text-gray-500 ml-2">{displayUnit}</span>
        </div>
        <div className="mt-3 flex justify-center gap-4 items-center">
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
      <div className="flex gap-2 mb-4">
        {awaitingWeight && !allDone && (
          <>
            <button
              onClick={handleManualRecord}
              disabled={!currentReading || autoMode}
              className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 disabled:border-base-700 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700"
            >
              Record Weight
              <span className="text-green-200/50 text-xs ml-2">Enter</span>
            </button>
            <button
              onClick={() => setAutoMode(prev => !prev)}
              className={`px-5 py-3 rounded-lg font-medium transition-colors border text-sm ${
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
          className="px-4 py-3 bg-base-800 hover:bg-base-700 disabled:bg-base-900 disabled:text-gray-700 disabled:border-base-800 text-gray-400 rounded-lg transition-colors border border-base-600 disabled:border-base-800 text-sm"
        >
          Undo <span className="text-gray-600 text-xs ml-1">Z</span>
        </button>
      </div>

      {allDone && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4 text-center">
          <p className="text-green-400 font-medium text-sm uppercase tracking-wider">
            All {totalPlants} plants weighed
          </p>
        </div>
      )}

      {/* Per-Strain Running Totals */}
      {session.readings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {strainCounts.map(sc => {
            const strainReadings = session.readings.filter(r => r.strain === sc.strain);
            const strainGrams = strainReadings.reduce((sum, r) => sum + r.weightGrams, 0);
            return (
              <div key={sc.id} className="bg-base-900 border border-base-700 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-400 truncate mb-1">{sc.strain}</p>
                <p className="text-lg font-mono font-medium text-gray-100 tabular-nums">{strainGrams.toFixed(1)}<span className="text-xs text-gray-500 ml-1">g</span></p>
                <p className="text-[10px] font-mono text-gray-600">{sc.weighed}/{sc.plantCount} plants</p>
              </div>
            );
          })}
          {/* Grand total */}
          <div className="bg-base-900 border border-green-500/20 rounded-lg p-3">
            <p className="text-xs font-medium text-green-400/70 mb-1">Total</p>
            <p className="text-lg font-mono font-medium text-gray-100 tabular-nums">{runningTotalGrams.toFixed(1)}<span className="text-xs text-gray-500 ml-1">g</span></p>
            <p className="text-[10px] font-mono text-gray-600">{runningTotalLbs.toFixed(2)} lbs</p>
          </div>
        </div>
      )}

      {/* Recent Entries */}
      {session.readings.length > 0 && (
        <div className="bg-base-900 border border-base-700 rounded-lg overflow-hidden mb-4">
          <div className="bg-base-800 px-4 py-2 border-b border-base-700">
            <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500">
              Recent Entries
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-base-900 border-b border-base-700">
                <tr>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">#</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Tag ID</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Strain</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weight (g)</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {[...session.readings].reverse().map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}>
                    <td className="px-4 py-1.5 font-mono text-gray-400 text-sm">{r.plantNumber}</td>
                    <td className="px-4 py-1.5 font-mono text-green-400/80 text-sm">{r.tagId}</td>
                    <td className="px-4 py-1.5 text-gray-300 text-sm">{r.strain}</td>
                    <td className="px-4 py-1.5 font-mono text-right text-gray-200 text-sm">{r.weightGrams.toFixed(1)}</td>
                    <td className="px-4 py-1.5 text-gray-500 text-xs">
                      {(r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Finish Button */}
      <div className="mt-4">
        <button
          onClick={onFinish}
          className={`w-full py-3 font-medium rounded-lg transition-colors border text-sm ${
            allDone
              ? 'bg-green-600 hover:bg-green-500 text-white border-green-500/30'
              : 'bg-base-800 hover:bg-base-700 text-gray-400 border-base-600'
          }`}
        >
          Finish Harvest {!allDone && `(${session.readings.length}/${totalPlants} plants)`}
        </button>
      </div>
    </div>
  );
}
