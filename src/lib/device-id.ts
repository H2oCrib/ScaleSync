/**
 * Persistent device UUID.
 *
 * Written once per browser profile, read on every cloud write so the server
 * can distinguish which station weighed a given plant. Safe to share across
 * tabs — they all write the same id.
 */

const STORAGE_KEY = 'scalesync-device-id';

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // localStorage blocked — generate ephemeral id for this session
    cached = cached ?? crypto.randomUUID();
    return cached;
  }
}
