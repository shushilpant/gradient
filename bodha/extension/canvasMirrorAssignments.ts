import { assignmentMaterials, materialEndpoint, readCanvasMaterials, type StudyMaterial } from './canvasMaterials.js';
import type { CanvasMirrorSnapshot } from './canvasMirrorPages.js';

type ExtractFile = Parameters<typeof readCanvasMaterials>[3];
const DESCRIPTION_LIMIT = 48_000;
const FILE_LIMIT = 60;
const TOTAL_TEXT_LIMIT = 2_000_000;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const normalized = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Stage extracted instruction text while the source account's browser session is available. */
export async function hydrateCanvasMirrorAssignments(snapshot: CanvasMirrorSnapshot, extract: ExtractFile, signal?: AbortSignal): Promise<CanvasMirrorSnapshot> {
  const source = new URL(snapshot.origin);
  if (source.protocol !== 'https:' || source.origin !== snapshot.origin || source.username || source.password ||
      (typeof window !== 'undefined' && window.location.origin !== source.origin)) {
    throw new Error('Assignment capture must use the signed-in Canvas tab’s HTTPS origin.');
  }
  const result: CanvasMirrorSnapshot = {
    ...snapshot,
    mirrorWarnings: [...snapshot.mirrorWarnings],
    courses: snapshot.courses.map(course => ({ ...course, assignments: course.assignments.map(assignment => ({ ...assignment })) })),
  };
  const cache = new Map<string, StudyMaterial | null>();
  const incomplete = new Set<string>();
  let total = 0;
  for (const course of result.courses) for (const assignment of course.assignments) {
    signal?.throwIfAborted();
    const original = assignment.descriptionHtml;
    const brief = normalized(original.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' '));
    const discovered = assignmentMaterials(original, source.origin, course.id);
    // A brief may name its PDF without a link. Only exact discovered file titles qualify.
    const named = course.resources.filter(resource => resource.type === 'file' && /\.pdf$/i.test(resource.title.trim()) &&
      brief.includes(normalized(resource.title))).map(({ title, url }) => ({ title, url }));
    const targets = new Map<string, StudyMaterial>();
    for (const resource of [...discovered, ...named]) {
      const endpoint = materialEndpoint(resource.url, source.origin, course.id);
      if (endpoint?.kind === 'file') targets.set(endpoint.path, resource);
    }
    for (const [key, resource] of targets) {
      signal?.throwIfAborted();
      const label = `${assignment.name}: ${resource.title}`;
      if (!cache.has(key)) {
        if (cache.size >= FILE_LIMIT || total >= TOTAL_TEXT_LIMIT) {
          result.mirrorWarnings.push(`${label}: instruction text was not copied because the staging attachment limit was reached.`);
          continue;
        }
        let extractedText = '';
        const loaded = await readCanvasMaterials([resource], source.origin, course.id, async file => {
          const extracted = await extract(file);
          extractedText = extracted.text;
          if (extracted.warnings.some(warning => /limited|truncat|only the first|shorten/i.test(warning))) incomplete.add(key);
          return extracted;
        }, signal);
        signal?.throwIfAborted();
        result.mirrorWarnings.push(...loaded.warnings);
        const loadedMaterial = loaded.resources.find(item => item.text?.trim());
        const readable = loadedMaterial ? { ...loadedMaterial, text: extractedText || loadedMaterial.text } : null;
        const remainingText = Math.max(0, TOTAL_TEXT_LIMIT - total);
        if (readable?.text && readable.text.length > remainingText) {
          readable.text = readable.text.slice(0, remainingText);
          incomplete.add(key);
          result.mirrorWarnings.push(`${label}: instruction text was shortened because the total staging text limit was reached.`);
        }
        cache.set(key, readable);
        total += readable?.text?.length ?? 0;
      }
      const material = cache.get(key);
      if (!material?.text?.trim()) {
        result.mirrorWarnings.push(`${label}: no readable instruction text was copied; the original file link remains a reference.`);
        continue;
      }
      const heading = (complete: boolean) => `<section data-offcanvas-assignment-source="${escape(resource.url)}" data-offcanvas-source-complete="${complete}"><h3>Extracted assignment instructions: ${escape(resource.title)}</h3><pre>`;
      const footer = '</pre></section>';
      const available = DESCRIPTION_LIMIT - assignment.descriptionHtml.length - heading(false).length - footer.length;
      if (available < 200) {
        result.mirrorWarnings.push(`${label}: instruction text was not copied because the assignment description is full.`);
        continue;
      }
      let text = material.text;
      let complete = !incomplete.has(key);
      // Bound the escaped HTML, not only the raw PDF text.
      if (escape(text).length > available) {
        let low = 0, high = text.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (escape(text.slice(0, middle)).length <= available) low = middle; else high = middle - 1;
        }
        text = text.slice(0, low);
        complete = false;
        result.mirrorWarnings.push(`${label}: extracted instructions were shortened to fit the assignment description; review the original file for the remaining text.`);
      }
      assignment.descriptionHtml += heading(complete) + escape(text) + footer;
    }
  }
  signal?.throwIfAborted();
  return result;
}
