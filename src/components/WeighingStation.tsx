import { useState, useCallback, useEffect } from 'react';
import type { ScaleReading, StrainSession, WeightReading } from '../lib/types';
import { GRAMS_PER_LB, isBaggedType } from '../lib/types';
import { useAutoCapture } from '../hooks/useAutoCapture';
import { useAudio } from '../hooks/useAudio';
import { WeightGrid } from './WeightGrid';

interface WeighingStationProps {
  session: StrainSession;
  currentReading: ScaleReading | null;
  onRecordWeight: (reading: WeightReading) => void;
  onUpdateReadings: (readings: WeightReading[]) => void;
  onFinishStrain: () => void;
  onTare: () => void;
  onZero: () => void;
  onStartContinuous: () => void;
  onStopContinuous: () => void;
}

export function WeighingStation({
  session,
  currentReading,
  onRecordWeight,
  onUpdateReadings,
  onFinishStrain,
  onTare,
  onZero,
  onStartContinuous,
  onStopContinuous,
}: WeighingStationProps) {
  const [autoMode, setAutoMode] = useState(false);
  const [continuousActive, setContinuousActive] = useState(false);
  const { playCapture, playComplete } = useAudio();

  const isBagged = isBaggedType(session.config.type);
  const itemLabel = isBagged ? 'Bag' : 'Unit';
  const itemsLabel = isBagged ? 'bags' : 'units';

  const fullUnits = session.config.totalUnits;
  const partialCount = session.config.partialCount || 0;
  const partialSizeGrams = session.config.partialSizeGrams || 226.8;
  const totalItems = fullUnits + partialCount;
  const nextItem = session.readings.length + 1;
  const allDone = nextItem > totalItems;
  const progress = session.readings.length / totalItems;

  const isPartialPhase = nextItem > fullUnits && nextItem <= totalItems;
  const partialLabel = `${partialSizeGrams}g`;

  const runningTotalGrams = session.readings.reduce((sum, r) => sum + r.weightGrams, 0);
  const runningTotalLbs = runningTotalGrams / GRAMS_PER_LB;

  const hasClaimed = session.config.claimedLbs != null || session.config.claimedGrams != null;
  const claimedGrams = session.config.claimedLbs != null
    ? session.config.claimedLbs * GRAMS_PER_LB
    : session.config.claimedGrams ?? 0;
  const tolerancePercent = hasClaimed && claimedGrams > 0
    ? ((runningTotalGrams - claimedGrams) / claimedGrams) * 100
    : null;

  const fullCount = session.readings.filter(r => !r.isPartial).length;
  const partialsDone = session.readings.filter(r => r.isPartial).length;

  const handleCapture = useCallback((weight: number) => {
    if (allDone) return;
    const currentIsPartial = nextItem > fullUnits;
    const reading: WeightReading = {
      id: crypto.randomUUID(),
      unitNumber: nextItem,
      weightGrams: Math.round(weight * 10) / 10,
      timestamp: new Date(),
      strain: session.config.strain,
      isPartial: currentIsPartial,
      partialSizeGrams: currentIsPartial ? partialSizeGrams : undefined,
    };
    onRecordWeight(reading);
    if (nextItem >= totalItems) {
      playComplete();
    } else {
      playCapture();
    }
  }, [allDone, nextItem, fullUnits, totalItems, partialSizeGrams, session.config.strain, onRecordWeight, playCapture, playComplete]);

  const { armed } = useAutoCapture({
    enabled: autoMode && !allDone,
    currentReading,
    onCapture: handleCapture,
  });

  const handleManualRecord = useCallback(() => {
    if (!currentReading || allDone || autoMode) return;
    handleCapture(currentReading.weight);
  }, [currentReading, allDone, autoMode, handleCapture]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Enter' || e.key === ' ') && !allDone && !autoMode) {
        e.preventDefault();
        handleManualRecord();
      }
      if (e.key === 'z' && !e.ctrlKey && !e.metaKey) {
        if (session.readings.length > 0) {
          onUpdateReadings(session.readings.slice(0, -1));
        }
      }
      if (e.key === 't') onTare();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualRecord, allDone, autoMode, session.readings, onUpdateReadings, onTare]);

  const handleUndoLast = () => {
    if (session.readings.length === 0) return;
    onUpdateReadings(session.readings.slice(0, -1));
  };

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
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Weighing</p>
          <h2 className="text-2xl font-semibold text-gray-50">{session.config.strain}</h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            {session.config.type} &middot;{' '}
            {isPartialPhase ? (
              <span className="text-amber-400/80">Partial {nextItem - fullUnits} of {partialCount} ({partialLabel})</span>
            ) : (
              <>{itemLabel} {Math.min(nextItem, fullUnits)} of {fullUnits}{partialCount > 0 && ` + ${partialCount} partials`}</>
            )}
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
          <span className="text-xs font-mono text-gray-400">{session.readings.length}/{totalItems}</span>
        </div>
        <div className="h-1.5 bg-base-800 rounded-full overflow-hidden border border-base-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-cyan-500'}`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>

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
          {autoMode && (
            <>
              <span className="text-base-600">|</span>
              <span className={`text-xs font-medium uppercase tracking-wider ${armed ? 'text-cyan-400' : 'text-gray-600'}`}>
                {armed ? 'Armed' : 'Waiting'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Tolerance Band */}
      {hasClaimed && session.readings.length > 0 && (
        <div className="bg-base-900 border border-base-700 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-gray-500">Variance</span>
            <span className={`text-xs font-mono font-medium ${
              tolerancePercent != null && Math.abs(tolerancePercent) <= 1 ? 'text-green-400' :
              tolerancePercent != null && Math.abs(tolerancePercent) <= 3 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {tolerancePercent != null ? `${tolerancePercent > 0 ? '+' : ''}${tolerancePercent.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="relative h-2 bg-base-800 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-[40%] right-[40%] bg-green-500/20 rounded" />
            <div className="absolute inset-y-0 left-[30%] right-[60%] bg-amber-500/10 rounded" />
            <div className="absolute inset-y-0 left-[60%] right-[30%] bg-amber-500/10 rounded" />
            {tolerancePercent != null && (
              <div
                className={`absolute top-0 bottom-0 w-1 rounded-full transition-all duration-300 ${
                  Math.abs(tolerancePercent) <= 1 ? 'bg-green-400' :
                  Math.abs(tolerancePercent) <= 3 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ left: `${Math.max(2, Math.min(98, 50 + tolerancePercent * 5))}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-600 font-mono">
              {isBagged ? `${runningTotalGrams.toFixed(1)} g actual` : `${runningTotalLbs.toFixed(2)} lbs actual`}
            </span>
            <span className="text-[10px] text-gray-600 font-mono">
              {session.config.claimedGrams != null
                ? `${session.config.claimedGrams.toFixed(1)} g claimed`
                : `${session.config.claimedLbs!.toFixed(2)} lbs claimed`}
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 mb-4">
        {!allDone && (
          <>
            <button
              onClick={handleManualRecord}
              disabled={!currentReading || autoMode}
              className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-base-800 disabled:text-gray-600 disabled:border-base-700 text-white font-medium rounded-lg transition-colors border border-cyan-500/30 disabled:border-base-700"
            >
              Record Weight
              <span className="text-cyan-200/50 text-xs ml-2">Enter</span>
            </button>
            <button
              onClick={() => setAutoMode(prev => !prev)}
              className={`px-5 py-3 rounded-lg font-medium transition-colors border text-sm ${
                autoMode
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
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
            All {fullUnits} {itemsLabel}{partialCount > 0 && ` + ${partialCount} partials`} weighed
          </p>
        </div>
      )}

      {/* Running Totals */}
      {session.readings.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-base-900 border border-base-700 rounded-lg p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Total (g)</p>
            <p className="text-lg font-mono font-medium text-gray-100 tabular-nums">{runningTotalGrams.toFixed(1)}</p>
          </div>
          <div className="bg-base-900 border border-base-700 rounded-lg p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Total (LBS)</p>
            <p className="text-lg font-mono font-medium text-gray-100 tabular-nums">{runningTotalLbs.toFixed(2)}</p>
          </div>
          <div className="bg-base-900 border border-base-700 rounded-lg p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Avg / {itemLabel}</p>
            <p className="text-lg font-mono font-medium text-gray-100 tabular-nums">
              {(runningTotalGrams / session.readings.length).toFixed(1)}
            </p>
          </div>
        </div>
      )}

      <WeightGrid readings={session.readings} onUpdateReadings={onUpdateReadings} />

      <div className="mt-4">
        <button
          onClick={onFinishStrain}
          className={`w-full py-3 font-medium rounded-lg transition-colors border text-sm ${
            allDone
              ? 'bg-green-600 hover:bg-green-500 text-white border-green-500/30'
              : 'bg-base-800 hover:bg-base-700 text-gray-400 border-base-600'
          }`}
        >
          Finish Strain {!allDone && `(${session.readings.length}/${totalItems} ${itemsLabel})`}
        </button>
      </div>
    </div>
  );
}
