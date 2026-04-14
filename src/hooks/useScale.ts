import { useState, useCallback, useRef } from 'react';
import { SERIAL_CONFIG, CMD, parseWeightResponse } from '../lib/serial-protocol';
import type { ScaleReading } from '../lib/types';

export interface UseScaleReturn {
  connected: boolean;
  currentReading: ScaleReading | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  tare: () => Promise<void>;
  zero: () => Promise<void>;
  requestWeight: () => Promise<ScaleReading | null>;
  startContinuous: () => Promise<void>;
  stopContinuous: () => Promise<void>;
  error: string | null;
}

export function useScale(): UseScaleReturn {
  const [connected, setConnected] = useState(false);
  const [currentReading, setCurrentReading] = useState<ScaleReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const readingLoopRef = useRef(false);
  const bufferRef = useRef('');

  const sendCommand = useCallback(async (cmd: string) => {
    if (!writerRef.current) { console.warn('[scale] no writer, cmd dropped:', JSON.stringify(cmd)); return; }
    console.log('[scale-cmd]', JSON.stringify(cmd));
    const encoder = new TextEncoder();
    await writerRef.current.write(encoder.encode(cmd));
  }, []);

  const startReadLoop = useCallback(async () => {
    if (!portRef.current?.readable) return;

    const decoder = new TextDecoderStream();
    const readableStreamClosed = portRef.current.readable.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>);
    const reader = decoder.readable.getReader();
    readerRef.current = reader;
    readingLoopRef.current = true;

    try {
      while (readingLoopRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          bufferRef.current += value;
          const lines = bufferRef.current.split(/\r?\n/);
          bufferRef.current = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              console.log('[scale-raw]', JSON.stringify(line));
              const reading = parseWeightResponse(line);
              if (reading) {
                console.log('[scale-parsed]', reading);
                setCurrentReading(reading);
              } else {
                console.warn('[scale-parse-fail]', JSON.stringify(line));
              }
            }
          }
        }
      }
    } catch (e) {
      if (readingLoopRef.current) setError(`Read error: ${e}`);
    } finally {
      reader.releaseLock();
      readableStreamClosed.catch(() => {});
    }
  }, []);

  const connect = useCallback(async () => {
    let port: SerialPort | null = null;
    try {
      setError(null);
      port = await navigator.serial.requestPort();

      // Port may already be open from prior session (tab refresh, HMR, crash).
      // Attempt open; if InvalidStateError, close and retry once.
      try {
        await port.open(SERIAL_CONFIG);
      } catch (openErr: any) {
        if (openErr.name === 'InvalidStateError' || /already open/i.test(openErr.message || '')) {
          console.warn('[scale] port already open, closing and retrying');
          try { await port.close(); } catch {}
          // Small delay to let driver release
          await new Promise(r => setTimeout(r, 200));
          await port.open(SERIAL_CONFIG);
        } else {
          throw openErr;
        }
      }

      portRef.current = port;
      if (port.writable) writerRef.current = port.writable.getWriter();
      setConnected(true);
      startReadLoop();
      // Test communication with single print command
      console.log('[scale] connected, sending test IP command');
      if (writerRef.current) {
        const enc = new TextEncoder();
        await writerRef.current.write(enc.encode('IP\r\n'));
        console.log('[scale] test IP sent');
      }
    } catch (e: any) {
      if (e.name === 'NotFoundError') return; // user cancelled picker
      // Clean up partial state on failure
      try { if (writerRef.current) { writerRef.current.releaseLock(); writerRef.current = null; } } catch {}
      try { if (port) await port.close(); } catch {}
      portRef.current = null;
      setConnected(false);
      setError(`Connection failed: ${e.message}`);
    }
  }, [startReadLoop]);

  const disconnect = useCallback(async () => {
    readingLoopRef.current = false;
    if (readerRef.current) { try { await readerRef.current.cancel(); } catch {} readerRef.current = null; }
    if (writerRef.current) { try { writerRef.current.releaseLock(); } catch {} writerRef.current = null; }
    if (portRef.current) { try { await portRef.current.close(); } catch {} portRef.current = null; }
    setConnected(false);
    setCurrentReading(null);
    bufferRef.current = '';
  }, []);

  const tare = useCallback(() => sendCommand(CMD.TARE), [sendCommand]);
  const zero = useCallback(() => sendCommand(CMD.ZERO), [sendCommand]);
  const requestWeight = useCallback(async (): Promise<ScaleReading | null> => {
    await sendCommand(CMD.IMMEDIATE_PRINT);
    return currentReading;
  }, [sendCommand, currentReading]);
  const startContinuous = useCallback(() => sendCommand(CMD.CONTINUOUS_PRINT), [sendCommand]);
  const stopContinuous = useCallback(() => sendCommand(CMD.STOP_CONTINUOUS), [sendCommand]);

  return { connected, currentReading, connect, disconnect, tare, zero, requestWeight, startContinuous, stopContinuous, error };
}
