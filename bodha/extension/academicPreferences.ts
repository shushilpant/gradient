import type { CanvasSnapshot } from './liveCanvas.js';
import { DEFAULT_GRADE_POINT_SCALE } from '../core/schema.js';
import { loadOptions, normalizeOptions } from './options/optionsStorage.js';

export interface AcademicPreferences {
  courseCreditHours: Record<string, number>;
  gradePointScale: Record<string, number>;
}
export const academicPreferencesKey = (snapshot: CanvasSnapshot) => `bodha_academic_v1:${encodeURIComponent(snapshot.origin)}:${encodeURIComponent(snapshot.user.id)}`;
const defaults = (): AcademicPreferences => ({ courseCreditHours: {}, gradePointScale: { ...DEFAULT_GRADE_POINT_SCALE } });
const normalize = (value: unknown): AcademicPreferences => {
  const normalized = normalizeOptions(value);
  return { courseCreditHours: normalized.courseCreditHours, gradePointScale: normalized.gradePointScale };
};
async function read(key: string): Promise<unknown> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, result => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message || 'Preferences could not be read.'));
      else resolve(result?.[key]);
    });
  });
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
export async function loadAcademicPreferences(snapshot: CanvasSnapshot): Promise<AcademicPreferences> {
  const saved = await read(academicPreferencesKey(snapshot));
  // Unscoped settings cannot be attributed to an account. Preserve them for explicit import.
  return saved ? normalize(saved) : defaults();
}
let pending: Promise<unknown> = Promise.resolve();
export async function saveAcademicPreferences(snapshot: CanvasSnapshot, preferences: AcademicPreferences): Promise<AcademicPreferences> {
  const key = academicPreferencesKey(snapshot), validated = normalize(preferences);
  const write = pending.catch(() => {}).then(async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [key]: validated }, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Preferences could not be saved.')); else resolve();
      });
    });
    else localStorage.setItem(key, JSON.stringify(validated));
  });
  pending = write;
  await write; return validated;
}
/** Explicit migration leaves the old configuration intact and scopes a copy to the selected account. */
export async function importLegacyAcademicPreferences(snapshot: CanvasSnapshot): Promise<AcademicPreferences> {
  return saveAcademicPreferences(snapshot, normalize(await loadOptions()));
}
