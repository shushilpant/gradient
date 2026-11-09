import { CanvasAuthenticationError, loadCanvasSnapshot, type CanvasSnapshot, type LoadCanvasOptions } from './liveCanvas.js';
import { legacyStorageKeys, readExtensionStorage } from './brandStorage.js';

const MAX_AGE = 10 * 60 * 1000;
const KEY = 'offcanvas_course_snapshot_v1:';
type Entry = { savedAt: number; snapshot: CanvasSnapshot };
const memory = new Map<string, Entry>();

async function clear(origin: string) {
  memory.delete(origin);
  for (const key of [KEY + origin, ...legacyStorageKeys(KEY + origin)]) {
    try { await chrome.storage.local.remove(key); } catch { /* Extension storage is optional. */ }
  }
}

/** Reuse coursework across mounts/navigation only after checking the signed-in account. */
export async function loadWorkspaceSnapshot(options: LoadCanvasOptions, force = false): Promise<CanvasSnapshot> {
  const origin = location.origin;
  let cached = memory.get(origin);
  if (!cached) {
    try { cached = await readExtensionStorage(chrome.storage.local, KEY + origin) as Entry | undefined; }
    catch { /* Tests and an invalidated extension still work without a cache. */ }
  }
  options.signal?.throwIfAborted();
  const age = cached ? Date.now() - cached.savedAt : Infinity;
  if (!force && cached?.snapshot?.origin === origin && age >= 0 && age < MAX_AGE) {
    try {
      const response = await fetch(origin + '/api/v1/users/self/profile', {
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new CanvasAuthenticationError();
      const profile = JSON.parse((await response.text()).replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, ''));
      if (String(profile.id) === cached.snapshot.user.id) {
        options.signal?.throwIfAborted();
        memory.set(origin, cached);
        return cached.snapshot;
      }
      await clear(origin);
    } catch (error) {
      if (!options.signal?.aborted) await clear(origin);
      throw error;
    }
  }
  // Never fall back to a previous student's data when a refresh fails.
  await clear(origin);
  const snapshot = await loadCanvasSnapshot(options);
  options.signal?.throwIfAborted();
  const entry = { savedAt: Date.now(), snapshot };
  memory.set(origin, entry);
  try { await chrome.storage.local.set({ [KEY + origin]: entry }); } catch { /* Keep the in-memory cache. */ }
  return snapshot;
}
