import type { StudyMaterial } from './canvasMaterials.js';
import { readCanvasFileInTab } from './sourceCanvasTab.js';
import { localAssistantFetch, validateBackendUrl } from './assistantTransport.js';

interface SourceMaterialRequest { backendUrl: string; resources: StudyMaterial[] }

/** Read only the original Canvas attachments explicitly linked by a local mirror. */
export async function readSourceCanvasMaterials(input: SourceMaterialRequest, senderUrl: string, senderContext: {windowId?: number; incognito?: boolean} = {}): Promise<{ resources: StudyMaterial[]; warnings: string[] }> {
  let sender: URL;
  try { sender = new URL(senderUrl); } catch { throw new Error('Read original course attachments from the local Canvas tab.'); }
  if (!['http://127.0.0.1:8080', 'http://localhost:8080'].includes(sender.origin) || sender.username || sender.password) {
    throw new Error('Original course attachment reading is available only from local Canvas on port 8080.');
  }
  if (!input || typeof input.backendUrl !== 'string') throw new Error('Invalid local extraction backend.');
  const backendUrl = validateBackendUrl(input.backendUrl);
  if (!Array.isArray(input.resources) || input.resources.length < 1 || input.resources.length > 12) {
    throw new Error('Choose between one and twelve linked course attachments.');
  }
  const groups = new Map<string, { origin: string; courseId: string; resources: StudyMaterial[] }>();
  for (const resource of input.resources) {
    if (!resource || typeof resource.title !== 'string' || resource.title.length > 1000 || typeof resource.url !== 'string' || resource.url.length > 3000) {
      throw new Error('Invalid original course attachment.');
    }
    let url: URL;
    try { url = new URL(resource.url); } catch { throw new Error('Invalid original course attachment URL.'); }
    const officialHost = url.hostname === 'canvas.usm.edu' || url.hostname === 'instructure.com' || url.hostname.endsWith('.instructure.com');
    const match = url.pathname.match(/^\/(?:courses\/(\d+)\/)?files\/(\d+)(?:\/download)?\/?$/);
    if (url.protocol !== 'https:' || !officialHost || url.port || url.username || url.password || !match) {
      throw new Error('Original attachment URLs must be HTTPS Canvas file links.');
    }
    const courseId = match[1] || '0';
    const key = `${url.origin}|${courseId}`;
    const group = groups.get(key) ?? { origin: url.origin, courseId, resources: [] };
    // Supplied text is never trusted as proof that an attachment was read.
    group.resources.push({ title: resource.title, url: resource.url });
    groups.set(key, group);
  }
  const byUrl = new Map<string, StudyMaterial>();
  const warnings: string[] = [];
  for (const group of groups.values()) for (const resource of group.resources) {
    try {
      // Canvas authentication must run as a first-party tab request. Worker
      // fetches lose the session when Chrome blocks third-party cookies.
      const file = await readCanvasFileInTab({origin:group.origin,courseId:group.courseId,resource}, senderContext);
      const result = await localAssistantFetch(backendUrl, '/api/v1/assistant/materials/extract', 'POST', file);
      if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string' || !result.text.trim()) {
        throw new Error('The local extractor did not return readable attachment text.');
      }
      const extractedWarnings = 'warnings' in result && Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === 'string') : [];
      byUrl.set(resource.url, {...resource, text:result.text.slice(0,22000)});
      warnings.push(...extractedWarnings.map(warning => `${resource.title}: ${warning}`));
    } catch (error) {
      byUrl.set(resource.url, resource);
      warnings.push(`${resource.title}: could not read contents (${error instanceof Error ? error.message : 'access unavailable'}).`);
    }
  }
  return { resources: input.resources.map(resource => byUrl.get(resource.url) ?? { title: resource.title, url: resource.url }), warnings };
}
