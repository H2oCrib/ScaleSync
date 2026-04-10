import { useState, useEffect, useRef, useCallback } from 'react';

interface UseUSBScannerOptions {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onScan: (tagId: string) => void;
  enabled?: boolean;
  // Max ms between keystrokes to consider it "rapid" (scanner input)
  rapidThreshold?: number;
  // Min chars for a valid scan
  minLength?: number;
  // Timeout after last activity to consider scanner "idle"
  idleTimeout?: number;
}

interface UseUSBScannerReturn {
  connected: boolean;     // true = scanner detected (has scanned recently)
  lastScanTime: number;   // timestamp of last scan
}

/**
 * Detects USB barcode/RFID scanner input by monitoring rapid keystroke patterns.
 * USB scanners act as keyboard HID devices — they type characters extremely fast
 * (< 50ms between keystrokes) then send Enter. This hook distinguishes scanner
 * input from human typing and provides a "connected" status.
 */
export function useUSBScanner({
  inputRef,
  onScan,
  enabled = true,
  rapidThreshold = 80,
  minLength = 4,
  idleTimeout = 30000,
}: UseUSBScannerOptions): UseUSBScannerReturn {
  const [connected, setConnected] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);
  const keystrokeTimesRef = useRef<number[]>([]);
  const idleTimerRef = useRef<number | null>(null);

  // Reset idle timer — scanner goes "disconnected" after no scans for a while
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setConnected(false);
    }, idleTimeout);
  }, [idleTimeout]);

  useEffect(() => {
    if (!enabled) return;

    const input = inputRef.current;
    if (!input) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();

      if (e.key === 'Enter') {
        const times = keystrokeTimesRef.current;
        const value = input.value.trim();

        if (times.length >= minLength && value.length >= minLength) {
          // Check if keystrokes were rapid (scanner-speed)
          let rapidCount = 0;
          for (let i = 1; i < times.length; i++) {
            if (times[i] - times[i - 1] < rapidThreshold) {
              rapidCount++;
            }
          }
          // If >70% of gaps are rapid, this is a scanner
          const rapidRatio = rapidCount / (times.length - 1);
          if (rapidRatio > 0.7) {
            setConnected(true);
            setLastScanTime(Date.now());
            resetIdleTimer();
          }
        }
        keystrokeTimesRef.current = [];
      } else if (e.key.length === 1) {
        // Single character key (not modifier/special)
        keystrokeTimesRef.current.push(now);
        // Keep only last 50 timestamps
        if (keystrokeTimesRef.current.length > 50) {
          keystrokeTimesRef.current = keystrokeTimesRef.current.slice(-50);
        }
      }
    };

    input.addEventListener('keydown', handleKeyDown);
    return () => {
      input.removeEventListener('keydown', handleKeyDown);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enabled, inputRef, onScan, rapidThreshold, minLength, resetIdleTimer]);

  return { connected, lastScanTime };
}
