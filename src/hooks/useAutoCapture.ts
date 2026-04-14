import { useEffect, useRef, useCallback, useState } from 'react';
import type { ScaleReading } from '../lib/types';

interface UseAutoCaptureOptions {
  enabled: boolean;
  currentReading: ScaleReading | null;
  onCapture: (weight: number) => void;
  stabilityCount?: number;
  minWeight?: number;
}

export function useAutoCapture({
  enabled,
  currentReading,
  onCapture,
  stabilityCount = 3,
  minWeight = 0.5,
}: UseAutoCaptureOptions) {
  const [armed, setArmed] = useState(true);
  const stableCountRef = useRef(0);
  const lastWeightRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setArmed(true);
    stableCountRef.current = 0;
    lastWeightRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !currentReading) return;
    const weight = currentReading.weight;

    if (weight < minWeight) {
      if (!armed) { setArmed(true); stableCountRef.current = 0; lastWeightRef.current = null; }
      return;
    }

    if (!armed) {
      stableCountRef.current = 0;
      lastWeightRef.current = weight;
      return;
    }

    // Capture based on weight consistency alone — 3 readings within 0.5g
    // No longer requires scale's stable flag
    if (lastWeightRef.current !== null && Math.abs(weight - lastWeightRef.current) < 0.5) {
      stableCountRef.current++;
    } else {
      stableCountRef.current = 1;
    }
    lastWeightRef.current = weight;

    if (stableCountRef.current >= stabilityCount) {
      onCapture(weight);
      setArmed(false);
      stableCountRef.current = 0;
    }
  }, [enabled, currentReading, armed, onCapture, stabilityCount, minWeight]);

  return { armed, reset };
}
