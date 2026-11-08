import { afterEach, describe, expect, it, vi } from 'vitest';
import { academicPreferencesKey, importLegacyAcademicPreferences, loadAcademicPreferences, saveAcademicPreferences } from '../extension/academicPreferences.js';
import type { CanvasSnapshot } from '../extension/liveCanvas.js';
import { OPTIONS_STORAGE_KEY } from '../extension/options/optionsStorage.js';
const account = (id: string, origin = 'https://canvas.instructure.com') => ({ origin, user: { id } }) as CanvasSnapshot;
afterEach(() => vi.unstubAllGlobals());
function store(seed: Record<string,unknown> = {}) {
  const values = { ...seed };
  vi.stubGlobal('chrome', { runtime: {}, storage: { local: {
    get: (key: string, callback: (value: Record<string,unknown>) => void) => callback({ [key]: values[key] }),
    set: (value: Record<string,unknown>, callback: () => void) => { Object.assign(values, value); callback(); },
  } } });
  return values;
}
describe('Account-scoped academic preferences', () => {
  it('isolates identical Canvas course identifiers across students and institutions', async () => {
    store();
    await saveAcademicPreferences(account('a'), { courseCreditHours: { '42': 5 }, gradePointScale: { A: 4.3 } });
    expect((await loadAcademicPreferences(account('a'))).courseCreditHours['42']).toBe(5);
    expect((await loadAcademicPreferences(account('b'))).courseCreditHours).toEqual({});
    expect((await loadAcademicPreferences(account('a','https://school.example'))).courseCreditHours).toEqual({});
  });
  it('preserves unowned legacy settings until explicitly imported to a selected student', async () => {
    const values = store({ [OPTIONS_STORAGE_KEY]: { courseCreditHours: { '42': 4 }, gradePointScale: { A: 4 } } });
    expect((await loadAcademicPreferences(account('a'))).courseCreditHours).toEqual({});
    await importLegacyAcademicPreferences(account('a'));
    expect(values[OPTIONS_STORAGE_KEY]).toEqual({ courseCreditHours: { '42': 4 }, gradePointScale: { A: 4 } });
    expect(values[academicPreferencesKey(account('a'))]).toMatchObject({ courseCreditHours: { '42': 4 } });
    expect((await loadAcademicPreferences(account('b'))).courseCreditHours).toEqual({});
  });
});
