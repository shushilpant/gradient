import { z } from 'zod';
import type { CanvasSnapshot } from './liveCanvas.js';
import { accountKey, emptyCommandState, type CommandState } from './commandCenter.js';
import { readExtensionStorage, readWebStorage } from './brandStorage.js';

const stateSchema = z.object({
  notes: z.array(z.object({ id: z.string(), text: z.string().max(1000), createdAt: z.string().datetime() })).max(50),
  blocks: z.array(z.object({ id: z.string(), title: z.string(), courseId: z.string(), assignmentId: z.string(), url: z.string(), start: z.string().datetime(), end: z.string().datetime(), completed: z.boolean() })).max(300),
  baseline: z.record(z.object({ title: z.string(), dueAt: z.string().nullable(), description: z.string(), rubric: z.string(), url: z.string(), courseId: z.string() })),
  changes: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), url: z.string(), courseId: z.string() })).max(30),
  updatedAt: z.string(),
});
export async function loadCommandState(snapshot: CanvasSnapshot): Promise<CommandState> {
  const key = accountKey(snapshot);
  let value: unknown;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) value = await readExtensionStorage(chrome.storage.local, key);
  else { try { value = JSON.parse(readWebStorage(localStorage, key) || 'null'); } catch { value = null; } }
  const parsed = stateSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyCommandState();
}
let pendingWrite: Promise<unknown> = Promise.resolve();
export async function saveCommandState(snapshot: CanvasSnapshot, value: CommandState): Promise<void> {
  const key = accountKey(snapshot);
  const validated = stateSchema.parse(value);
  const write = pendingWrite.catch(() => {}).then(async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [key]: validated });
    else localStorage.setItem(key, JSON.stringify(validated));
  });
  pendingWrite = write;
  return write;
}
