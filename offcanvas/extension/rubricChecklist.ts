import { readStorageValue, writeStorageValue } from './brandStorage.js';

export function rubricCheckKey(accountScope: string, courseId: string, assignmentId: string, criterionId: string): string {
  return 'offcanvas_rubric_check_v1:' + [accountScope, courseId, assignmentId, criterionId].map(encodeURIComponent).join(':');
}

// Each criterion is saved separately so changes to different boxes never overwrite each other.
const pendingChecks = new Map<string, Promise<void>>();

export async function loadRubricCheck(key: string): Promise<boolean> {
  await pendingChecks.get(key)?.catch(() => {});
  const store = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  return store ? await readStorageValue(store, key) === true : localStorage.getItem(key) === 'true';
}

export async function saveRubricCheck(key: string, checked: boolean): Promise<void> {
  const store = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  const previous = pendingChecks.get(key) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    if (store) await writeStorageValue(store, key, checked);
    else localStorage.setItem(key, String(checked));
  });
  pendingChecks.set(key, write);
  try {
    await write;
  } finally {
    if (pendingChecks.get(key) === write) pendingChecks.delete(key);
  }
}
