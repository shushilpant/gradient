/** Old product names are read only to preserve settings during an extension upgrade. */
export function legacyStorageKeys(key: string): string[] {
  return ['gradient', 'bodha'].map(name => key.replace(/^offcanvas(?=[_-])/, name));
}

export function readWebStorage(storage: Storage, key: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  for (const oldKey of legacyStorageKeys(key)) {
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    try { storage.setItem(key, value); storage.removeItem(oldKey); } catch { /* Read-only storage still supplies the saved value. */ }
    return value;
  }
  return null;
}

/** Support Chrome's callback API as well as promise-based storage shims. */
export function readStorageValue(store: chrome.storage.StorageArea, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      const result: unknown = store.get(key, values => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Browser storage is unavailable.'));
        else resolve(values?.[key]);
      });
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<Record<string, unknown>>).then(values => resolve(values?.[key]), reject);
      }
    } catch (error) { reject(error); }
  });
}

export function writeStorageValue(store: chrome.storage.StorageArea, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const result: unknown = store.set({ [key]: value }, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Browser storage is unavailable.'));
        else resolve();
      });
      if (result && typeof (result as Promise<unknown>).then === 'function') void (result as Promise<unknown>).then(() => resolve(), reject);
    } catch (error) { reject(error); }
  });
}

export async function readExtensionStorage(store: chrome.storage.StorageArea, key: string): Promise<unknown> {
  const current = await readStorageValue(store, key);
  if (current !== undefined) return current;
  for (const oldKey of legacyStorageKeys(key)) {
    const value = await readStorageValue(store, oldKey);
    if (value === undefined) continue;
    try {
      await writeStorageValue(store, key, value);
      if (store.remove) await store.remove(oldKey);
    } catch { /* Preserve access even when migration cannot be saved. */ }
    return value;
  }
  return undefined;
}
