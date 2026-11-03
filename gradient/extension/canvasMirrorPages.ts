import { materialEndpoint } from './canvasMaterials.js';
import type { CanvasCourseSnapshot, CanvasResource, CanvasSnapshot } from './liveCanvas.js';

export interface CanvasMirrorResource extends CanvasResource { bodyHtml?: string }
export type CanvasMirrorSnapshot = Omit<CanvasSnapshot, 'courses'> & {
  courses: Array<Omit<CanvasCourseSnapshot, 'resources'> & { resources: CanvasMirrorResource[] }>;
  mirrorWarnings: string[];
};

const PAGE_LIMIT = 60;
const PAGE_BYTES = 1024 * 1024;
const TOTAL_BYTES = 6 * 1024 * 1024;
const CONCURRENCY = 3;
const TIMEOUT_MS = 10000;
type ReadBudget = { bytes: number; exhausted: boolean };
type AccessRecord = Record<string, unknown>;
type PageTarget = { url: string; title: string; resources: CanvasMirrorResource[] };

function restricted(record: AccessRecord): boolean {
  const details = record.content_details as AccessRecord | undefined;
  return record.locked_for_user === true || record.hidden_for_user === true ||
    record.lockedForUser === true || record.hiddenForUser === true ||
    record.published === false || record.state === 'locked' || details?.locked_for_user === true;
}

async function boundedPage(response: Response, budget: ReadBudget): Promise<string> {
  if (Number(response.headers.get('Content-Length')) > PAGE_BYTES) {
    await response.body?.cancel();
    throw new Error('The page exceeds the 1 MB capture limit.');
  }
  if (!response.body) throw new Error('Canvas returned an empty page response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (budget.bytes + value.byteLength > TOTAL_BYTES) {
        budget.exhausted = true;
        throw new Error('The 6 MB total page capture limit was reached.');
      }
      budget.bytes += value.byteLength;
      length += value.byteLength;
      if (length > PAGE_BYTES) throw new Error('The page exceeds the 1 MB capture limit.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

/** Explicit staging only: capture already-discovered course pages, never crawl links or download files. */
export async function hydrateCanvasMirrorPages(snapshot: CanvasSnapshot): Promise<CanvasMirrorSnapshot> {
  const source = new URL(snapshot.origin);
  if (source.protocol !== 'https:' || source.origin !== snapshot.origin || source.username || source.password ||
      (typeof window !== 'undefined' && window.location.origin !== source.origin)) {
    throw new Error('Canvas page capture must use the signed-in tab’s HTTPS origin.');
  }
  const warnings: string[] = [];
  const result: CanvasMirrorSnapshot = {
    ...snapshot,
    courses: snapshot.courses.map(course => ({ ...course, resources: course.resources.map(resource => {
      const copy: CanvasMirrorResource = { ...resource };
      delete copy.bodyHtml;
      return copy;
    }) })),
    mirrorWarnings: warnings,
  };
  const targets = new Map<string, PageTarget>();
  let omittedPages = 0;
  let files = 0;
  for (const course of result.courses) {
    for (const resource of course.resources) {
      if (resource.type === 'file') { files++; continue; }
      if (resource.type !== 'page') continue;
      const title = resource.title.slice(0, 120) || 'Course page';
      if (restricted(resource as unknown as AccessRecord)) {
        warnings.push(`${title}: locked, hidden or unpublished; its body was not copied.`);
        continue;
      }
      const endpoint = materialEndpoint(resource.url, source.origin, course.id);
      if (endpoint?.kind !== 'page') {
        warnings.push(`${title}: not a page in its discovered course; its body was not copied.`);
        continue;
      }
      const url = source.origin + endpoint.path;
      const existing = targets.get(url);
      if (existing) { existing.resources.push(resource); continue; }
      if (targets.size >= PAGE_LIMIT) { omittedPages++; continue; }
      targets.set(url, { url, title, resources: [resource] });
    }
  }
  if (omittedPages) warnings.push(`${omittedPages} additional page link(s) were not read because staging is limited to 60 pages.`);
  if (files) warnings.push(`${files} file link(s) remain references; file attachment bytes are not copied by this staging action.`);
  const pending = [...targets.values()];
  const budget: ReadBudget = { bytes: 0, exhausted: false };
  let next = 0;
  async function worker(): Promise<void> {
    while (next < pending.length) {
      const target = pending[next++];
      if (!target) break;
      if (budget.exhausted) {
        warnings.push(`${target.title}: not read because the 6 MB total page capture limit was reached.`);
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(target.url, {
          method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store',
          headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}.`);
        if (response.redirected || (response.url && new URL(response.url).origin !== source.origin)) {
          throw new Error('Canvas redirected the page request.');
        }
        const raw = await boundedPage(response, budget);
        const parsed: unknown = JSON.parse(raw.replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, ''));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Canvas did not return a page record.');
        const page = parsed as AccessRecord;
        if (restricted(page)) throw new Error('The page is locked, hidden or unpublished.');
        if (typeof page.body !== 'string') throw new Error('Canvas did not return the page body.');
        for (const resource of target.resources) resource.bodyHtml = page.body;
      } catch (error) {
        const detail = error instanceof Error && error.name === 'AbortError'
          ? 'The page request timed out after 10 seconds.'
          : error instanceof Error ? error.message : 'Canvas access was unavailable.';
        warnings.push(`${target.title}: body not copied (${detail}) Its link remains a reference.`);
      } finally { clearTimeout(timer); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  return result;
}
