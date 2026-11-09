import { DEFAULT_GRADE_POINT_SCALE } from '../../core/schema.js';
import { legacyStorageKeys, readExtensionStorage, readStorageValue, readWebStorage } from '../brandStorage.js';

export interface OffCanvasOptions {
  canvasHosts: string[];
  courseCreditHours: Record<string, number>;
  gradePointScale: Record<string, number>;
  detailLevel: 'a_bit' | 'a_bit_more' | 'all_in';
}

export const DEFAULT_OFFCANVAS_OPTIONS: OffCanvasOptions = {
  canvasHosts: ['*.instructure.com', 'localhost', '127.0.0.1', 'canvas.usm.edu'],
  courseCreditHours: {},
  gradePointScale: { ...DEFAULT_GRADE_POINT_SCALE },
  detailLevel: 'a_bit_more',
};

export const OPTIONS_STORAGE_KEY = 'offcanvas_user_options';
let memoryOptions: OffCanvasOptions | undefined;

/** Hostnames only. A preference never grants a browser host permission. */
export function normalizeCanvasHost(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (host === '*.instructure.com' || host === 'localhost' || host === '127.0.0.1') return host;
  if (host.length > 253 || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.split('.').some(part => !part || part.length > 63 || part.startsWith('-') || part.endsWith('-'))) return null;
  // Private addresses and ports are not custom HTTPS Canvas domains.
  if (/^\d+(?:\.\d+){3}$/.test(host)) return null;
  return host;
}

function numericRecord(value: unknown, maximum: number, minimum = 0): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, number]) =>
    key.length > 0 && key.length <= 200 && typeof number === 'number' && Number.isFinite(number) && number >= minimum && number <= maximum));
}

/** Saved preferences may come from an older version or a damaged browser store. */
export function normalizeOptions(value: unknown): OffCanvasOptions {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<OffCanvasOptions> : {};
  const hosts = Array.isArray(saved.canvasHosts)
    ? saved.canvasHosts.filter((host): host is string => typeof host === 'string').map(normalizeCanvasHost).filter((host): host is string => !!host)
    : DEFAULT_OFFCANVAS_OPTIONS.canvasHosts;
  const scale = numericRecord(saved.gradePointScale, 5);
  return {
    canvasHosts: [...new Set(hosts)],
    courseCreditHours: numericRecord(saved.courseCreditHours, 30, 0.5),
    gradePointScale: Object.keys(scale).length ? scale : { ...DEFAULT_OFFCANVAS_OPTIONS.gradePointScale },
    detailLevel: saved.detailLevel === 'a_bit' || saved.detailLevel === 'all_in' ? saved.detailLevel : 'a_bit_more',
  };
}

async function readStore(store: chrome.storage.StorageArea, migrate = true): Promise<unknown> {
  try {
    if (migrate) return await readExtensionStorage(store, OPTIONS_STORAGE_KEY);
    for (const key of [OPTIONS_STORAGE_KEY, ...legacyStorageKeys(OPTIONS_STORAGE_KEY)]) {
      const value = await readStorageValue(store, key);
      if (value !== undefined) return value;
    }
  } catch { /* Unavailable storage uses defaults. */ }
  return undefined;
}

function writeStore(store: chrome.storage.StorageArea, options: OffCanvasOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      store.set({ [OPTIONS_STORAGE_KEY]: options }, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Browser storage is unavailable.'));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
}

export async function loadOptions(): Promise<OffCanvasOptions> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const local = await readStore(chrome.storage.local);
    if (local !== undefined) return normalizeOptions(local);
    // Preserve preferences from releases that used Chrome Sync, then keep future writes on this device.
    if (chrome.storage.sync) {
      const legacy = await readStore(chrome.storage.sync, false);
      if (legacy !== undefined) {
        const migrated = normalizeOptions(legacy);
        try {
          await writeStore(chrome.storage.local, migrated);
          for (const key of [OPTIONS_STORAGE_KEY, ...legacyStorageKeys(OPTIONS_STORAGE_KEY)]) {
            chrome.storage.sync.remove(key, () => { void chrome.runtime?.lastError; });
          }
        } catch { /* Reading preferences still works if migration cannot be saved. */ }
        return migrated;
      }
    }
    return normalizeOptions(undefined);
  }
  if (memoryOptions) return normalizeOptions(memoryOptions);
  try {
    const raw = typeof localStorage !== 'undefined' ? readWebStorage(localStorage, OPTIONS_STORAGE_KEY) : null;
    if (raw) return normalizeOptions(JSON.parse(raw));
  } catch { /* Storage may be blocked in private browsing or embedded previews. */ }
  return normalizeOptions(undefined);
}

export async function saveOptions(options: Partial<OffCanvasOptions>): Promise<OffCanvasOptions> {
  const updated = normalizeOptions({ ...await loadOptions(), ...options });
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await writeStore(chrome.storage.local, updated);
    // Never copy extension preferences into the Canvas site's localStorage.
    return updated;
  }
  memoryOptions = updated;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch { /* An ephemeral preview can keep its settings for this session. */ }
  return updated;
}
