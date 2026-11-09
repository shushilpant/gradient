import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OFFCANVAS_OPTIONS, OPTIONS_STORAGE_KEY, loadOptions, normalizeCanvasHost, normalizeOptions, saveOptions } from '../extension/options/optionsStorage.js';
import { customCanvasOrigins, registerCanvasHosts } from '../extension/canvasHosts.js';

function storage(seed?: unknown) {
  const values: Record<string, unknown> = seed === undefined ? {} : { [OPTIONS_STORAGE_KEY]: seed };
  return {
    values,
    get: vi.fn((key: string, callback: (value: Record<string, unknown>) => void) => callback({ [key]: values[key] })),
    set: vi.fn((data: Record<string, unknown>, callback: () => void) => { Object.assign(values, data); callback(); }),
    remove: vi.fn((key: string, callback: () => void) => { delete values[key]; callback(); }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Local extension preferences', () => {
  it('starts without invented course credit hours and returns independent defaults', async () => {
    vi.stubGlobal('chrome', { storage: { local: storage(), sync: storage() } });
    const first = await loadOptions(); first.canvasHosts.length = 0; first.gradePointScale.A = 1;
    const second = await loadOptions();
    expect(second.courseCreditHours).toEqual({});
    expect(second.canvasHosts).toEqual(DEFAULT_OFFCANVAS_OPTIONS.canvasHosts);
    expect(second.gradePointScale.A).toBe(DEFAULT_OFFCANVAS_OPTIONS.gradePointScale.A);
  });

  it('migrates Chrome Sync preferences once, and writes only to local extension storage', async () => {
    const local = storage(); const sync = storage({ courseCreditHours: { 'Course 42': 4 } });
    const siteStorage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('chrome', { storage: { local, sync } }); vi.stubGlobal('localStorage', siteStorage);
    expect((await loadOptions()).courseCreditHours).toEqual({ 'Course 42': 4 });
    expect(sync.remove).toHaveBeenCalledWith(OPTIONS_STORAGE_KEY, expect.any(Function));
    await saveOptions({ courseCreditHours: { 'Course 42': 5 } });
    expect(local.values[OPTIONS_STORAGE_KEY]).toMatchObject({ courseCreditHours: { 'Course 42': 5 } });
    expect(sync.set).not.toHaveBeenCalled(); expect(siteStorage.setItem).not.toHaveBeenCalled();
  });

  it('normalizes corrupted saved data without breaking Canvas startup', () => {
    expect(normalizeOptions({ canvasHosts: [null, 'HTTPS://bad.test', ' Canvas.School.edu. ', 'canvas.school.edu'],
      courseCreditHours: { valid: 3, negative: -1, zero: 0, string: '4', huge: 100, infinity: Infinity },
      gradePointScale: [], detailLevel: 'broken',
    })).toEqual({ canvasHosts: ['canvas.school.edu'], courseCreditHours: { valid: 3 },
      gradePointScale: DEFAULT_OFFCANVAS_OPTIONS.gradePointScale, detailLevel: 'a_bit_more' });
  });

  it('surfaces browser write failures instead of claiming settings were saved', async () => {
    const local = storage({}); const runtime: { lastError?: { message: string } } = {};
    local.set.mockImplementation((_data, callback) => { runtime.lastError = { message: 'Storage quota exceeded.' }; callback(); delete runtime.lastError; });
    vi.stubGlobal('chrome', { storage: { local }, runtime });
    await expect(saveOptions({ detailLevel: 'all_in' })).rejects.toThrow('Storage quota exceeded.');
  });

  it('accepts hostnames and rejects URLs, ports, broad wildcards and malformed hosts', () => {
    expect(normalizeCanvasHost('canvas.school.edu')).toBe('canvas.school.edu');
    expect(normalizeCanvasHost('*.instructure.com')).toBe('*.instructure.com');
    for (const host of ['https://canvas.school.edu', 'canvas.school.edu:443', '*.edu', '*', 'school..edu', '-school.edu', '127.0.0.2']) {
      expect(normalizeCanvasHost(host)).toBeNull();
    }
  });
});

describe('Custom Canvas site registration', () => {
  it('requests only exact custom HTTPS origins', () => {
    expect(customCanvasOrigins(['*.instructure.com', 'school.instructure.com', 'localhost', 'canvas.usm.edu', 'Canvas.School.edu', 'canvas.school.edu']))
      .toEqual(['https://canvas.school.edu/*']);
  });

  it('registers content scripts only for saved sites with granted browser access', async () => {
    const scripting = { getRegisteredContentScripts: vi.fn().mockResolvedValue([]), registerContentScripts: vi.fn().mockResolvedValue(undefined),
      updateContentScripts: vi.fn(), unregisterContentScripts: vi.fn() };
    vi.stubGlobal('chrome', { scripting, permissions: { contains: vi.fn(async ({ origins }: { origins: string[] }) => origins[0] === 'https://canvas.school.edu/*') } });
    await registerCanvasHosts({ ...DEFAULT_OFFCANVAS_OPTIONS, canvasHosts: ['canvas.school.edu', 'other.school.edu'] });
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({
      matches: ['https://canvas.school.edu/*'], js: ['extension/content.js'], persistAcrossSessions: true, allFrames: false,
    })]);
  });

  it('updates an existing script and unregisters it when all custom sites are removed', async () => {
    const scripting = { getRegisteredContentScripts: vi.fn().mockResolvedValue([{ id: 'bodha-custom-canvas' }]), registerContentScripts: vi.fn(),
      updateContentScripts: vi.fn().mockResolvedValue(undefined), unregisterContentScripts: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('chrome', { scripting, permissions: { contains: vi.fn().mockResolvedValue(true) } });
    await registerCanvasHosts({ ...DEFAULT_OFFCANVAS_OPTIONS, canvasHosts: ['canvas.school.edu'] });
    expect(scripting.updateContentScripts).toHaveBeenCalledOnce(); expect(scripting.registerContentScripts).not.toHaveBeenCalled();
    await registerCanvasHosts(DEFAULT_OFFCANVAS_OPTIONS);
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['bodha-custom-canvas'] });
  });
});
