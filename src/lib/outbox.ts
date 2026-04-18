/**
 * Offline-safe outbox queue for cloud writes.
 *
 * Writes are ALWAYS enqueued synchronously to localStorage, never awaited by
 * the UI capture path. A background worker drains the queue whenever the
 * browser is online, with exponential backoff on failure.
 *
 * Ops are idempotent thanks to client-generated UUIDs + upsert onConflict:'id',
 * so replaying the queue after a crash is safe.
 */

import { cloudEnabled } from './supabase';
import {
  pushHarvest,
  pushReadings,
  markHarvestCompleted,
  type Result,
} from './cloud';
import type { HarvestSession, WetWeightReading, WorkflowMode } from './types';

// ─── Op types ──────────────────────────────────────────────────────────────

export type OutboxOp =
  | {
      kind: 'pushHarvest';
      opId: string;
      session: HarvestSession;
      workflowMode: WorkflowMode;
      deviceId: string;
    }
  | {
      kind: 'pushReadings';
      opId: string;
      harvestId: string;
      readings: WetWeightReading[];
      deviceId: string;
    }
  | {
      kind: 'markCompleted';
      opId: string;
      harvestId: string;
    };

interface OutboxEntry {
  op: OutboxOp;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

// ─── Persistence ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'scalesync-outbox';

function readQueue(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxEntry[];
    // Dates in readings were JSON-stringified — rehydrate when an op is popped.
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(q: OutboxEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // Quota exceeded — drop silently; data is still in local session.
  }
}

// Rehydrate Date fields on a session/readings pulled from localStorage.
function rehydrateOp(op: OutboxOp): OutboxOp {
  if (op.kind === 'pushHarvest') {
    return {
      ...op,
      session: {
        ...op.session,
        config: {
          ...op.session.config,
          date:
            op.session.config.date instanceof Date
              ? op.session.config.date
              : new Date(op.session.config.date as unknown as string),
        },
        readings: op.session.readings.map(r => ({
          ...r,
          timestamp:
            r.timestamp instanceof Date
              ? r.timestamp
              : new Date(r.timestamp as unknown as string),
        })),
      },
    };
  }
  if (op.kind === 'pushReadings') {
    return {
      ...op,
      readings: op.readings.map(r => ({
        ...r,
        timestamp:
          r.timestamp instanceof Date
            ? r.timestamp
            : new Date(r.timestamp as unknown as string),
      })),
    };
  }
  return op;
}

// ─── Status pub/sub ───────────────────────────────────────────────────────

export interface OutboxStatus {
  queued: number;
  lastError: string | null;
  lastSuccessAt: Date | null;
  online: boolean;
}

const statusTarget = new EventTarget();
let lastSuccessAt: Date | null = null;
let lastError: string | null = null;

function emit(): void {
  statusTarget.dispatchEvent(new Event('change'));
}

export function getStatus(): OutboxStatus {
  return {
    queued: readQueue().length,
    lastError,
    lastSuccessAt,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
}

export function subscribeStatus(listener: (s: OutboxStatus) => void): () => void {
  const handler = () => listener(getStatus());
  statusTarget.addEventListener('change', handler);
  const online = () => emit();
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  // Push immediately so callers can render without waiting for first tick.
  listener(getStatus());
  return () => {
    statusTarget.removeEventListener('change', handler);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', online);
  };
}

// ─── Enqueue ───────────────────────────────────────────────────────────────

export function enqueue(op: OutboxOp): void {
  if (!cloudEnabled) return;
  const q = readQueue();
  q.push({ op, attempts: 0, nextAttemptAt: Date.now(), lastError: null });
  writeQueue(q);
  emit();
}

// ─── Worker ────────────────────────────────────────────────────────────────

const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;
const TICK_MS = 1_000;

async function executeOp(op: OutboxOp): Promise<Result> {
  const fresh = rehydrateOp(op);
  if (fresh.kind === 'pushHarvest') {
    return pushHarvest(fresh.session, fresh.workflowMode, fresh.deviceId);
  }
  if (fresh.kind === 'pushReadings') {
    return pushReadings(fresh.harvestId, fresh.readings, fresh.deviceId);
  }
  return markHarvestCompleted(fresh.harvestId);
}

function backoff(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts), MAX_BACKOFF_MS);
}

async function tick(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const q = readQueue();
  if (q.length === 0) return;

  const now = Date.now();
  const due = q.findIndex(e => e.nextAttemptAt <= now);
  if (due === -1) return;

  const entry = q[due];
  const result = await executeOp(entry.op);

  if (result.ok) {
    q.splice(due, 1);
    writeQueue(q);
    lastSuccessAt = new Date();
    lastError = null;
  } else {
    entry.attempts += 1;
    entry.nextAttemptAt = now + backoff(entry.attempts);
    entry.lastError = result.error;
    lastError = result.error;
    writeQueue(q);
  }
  emit();
}

let workerId: ReturnType<typeof setInterval> | null = null;

export function startFlushWorker(): () => void {
  if (!cloudEnabled) return () => {};
  if (workerId !== null) {
    // Already running; return a no-op cleanup so callers can't stop it twice.
    return () => {};
  }
  workerId = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Drain once immediately on start.
  void tick();
  return () => {
    if (workerId !== null) {
      clearInterval(workerId);
      workerId = null;
    }
  };
}
