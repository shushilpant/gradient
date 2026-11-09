import { afterEach, expect, it, vi } from 'vitest';
import { loadRubricCheck, rubricCheckKey, saveRubricCheck } from '../extension/rubricChecklist.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps each rubric check within its Canvas account, course, assignment, and criterion', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const account = 'https://canvas.example|alice';
  const key = rubricCheckKey(account, '101', '2', 'c1');
  await saveRubricCheck(key, true);
  expect(await loadRubricCheck(key)).toBe(true);
  for (const other of [
    rubricCheckKey('https://canvas.example|bob', '101', '2', 'c1'),
    rubricCheckKey('http://127.0.0.1:8085|alice', '101', '2', 'c1'),
    rubricCheckKey(account, '102', '2', 'c1'),
    rubricCheckKey(account, '101', '3', 'c1'),
    rubricCheckKey(account, '101', '2', 'c2'),
  ]) expect(await loadRubricCheck(other)).toBe(false);
});

it('hydrates after pending changes and persists the latest choice for the same criterion', async () => {
  const key = rubricCheckKey('https://canvas.example|alice', '101', '2', 'c1');
  let stored = false;
  let finishFirstWrite!: () => void;
  const firstWrite = new Promise<void>(resolve => { finishFirstWrite = resolve; });
  const writes: boolean[] = [];
  vi.stubGlobal('chrome', { storage: { local: {
    get: async () => ({ [key]: stored }),
    set: async (values: Record<string, boolean>) => {
      const checked = values[key]!;
      if (checked) await firstWrite;
      writes.push(checked);
      stored = checked;
    },
  } } });

  const check = saveRubricCheck(key, true);
  const uncheck = saveRubricCheck(key, false);
  const hydrate = loadRubricCheck(key);
  finishFirstWrite();
  await Promise.all([check, uncheck]);
  expect(await hydrate).toBe(false);
  expect(writes).toEqual([true, false]);
});
