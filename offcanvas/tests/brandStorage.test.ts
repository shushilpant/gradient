import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExtensionStorage, readWebStorage } from '../extension/brandStorage.js';

afterEach(() => vi.unstubAllGlobals());

describe('OffCanvas storage upgrades', () => {
  it('preserves account-scoped preferences under either previous product name', () => {
    for (const name of ['gradient', 'bodha']) {
      const previous = `${name}_academic_v1:school:student`;
      const current = 'offcanvas_academic_v1:school:student';
      const values = new Map([[previous, '{"courseCreditHours":{"42":4}}']]);
      const storage = { getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } as Storage;
      expect(readWebStorage(storage, current)).toBe('{"courseCreditHours":{"42":4}}');
      expect(values.has(previous)).toBe(false);
      expect(values.has(current)).toBe(true);
    }
  });

  it('keeps current settings authoritative when old values remain', async () => {
    const values = { offcanvas_assistant_settings: { reasoningModel: 'chosen-model' }, gradient_assistant_settings: { reasoningModel: 'old-model' } };
    const store = { get: vi.fn(async (key: keyof typeof values) => ({ [key]: values[key] })), set: vi.fn() };
    vi.stubGlobal('chrome', { runtime: {} });
    expect(await readExtensionStorage(store as unknown as chrome.storage.StorageArea, 'offcanvas_assistant_settings')).toEqual({ reasoningModel: 'chosen-model' });
    expect(store.set).not.toHaveBeenCalled();
  });

  it('migrates promise-based extension storage and removes a legacy key only after saving', async () => {
    const values: Record<string, unknown> = { gradient_assistant_settings: { reasoningModel: 'chosen-model' } };
    const store = { get: async (key: string) => ({ [key]: values[key] }),
      set: async (entry: Record<string, unknown>) => { Object.assign(values, entry); }, remove: async (key: string) => { delete values[key]; } };
    vi.stubGlobal('chrome', { runtime: {} });
    expect(await readExtensionStorage(store as unknown as chrome.storage.StorageArea, 'offcanvas_assistant_settings')).toEqual({ reasoningModel: 'chosen-model' });
    expect(values).toEqual({ offcanvas_assistant_settings: { reasoningModel: 'chosen-model' } });
  });

  it('retains access and the original value when a migration write fails', async () => {
    const saved = { courseCreditHours: { '42': 4 } };
    const store = { get: async (key: string) => ({ [key]: key === 'bodha_academic_v1:school:student' ? saved : undefined }),
      set: async () => { throw new Error('Storage quota exceeded.'); }, remove: vi.fn() };
    vi.stubGlobal('chrome', { runtime: {} });
    expect(await readExtensionStorage(store as unknown as chrome.storage.StorageArea, 'offcanvas_academic_v1:school:student')).toEqual(saved);
    expect(store.remove).not.toHaveBeenCalled();
  });
});
