export interface StudyMaterial { title: string; url: string; text?: string }
type ExtractFile = (file: { title: string; mimeType: string; data: string }) => Promise<{ text: string; warnings: string[] }>;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export function canvasHtmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,input,textarea,select').forEach(el => el.remove());
  doc.querySelectorAll('p,br,li,h1,h2,h3,tr').forEach(el => el.append(doc.createTextNode('\n')));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function materialEndpoint(value: string, origin: string, courseId: string): { kind: 'page' | 'file'; path: string } | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    const page = url.pathname.match(/^\/courses\/([^/]+)\/pages\/([^/]+)\/?$/);
    if (page && page[1] === courseId) {
      const slug = decodeURIComponent(page[2]!);
      if (/[\\/%]/.test(slug) || /^\.+$/.test(slug)) return null;
      return { kind: 'page', path: `/api/v1/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(slug)}` };
    }
    const file = url.pathname.match(/^\/courses\/([^/]+)\/files\/(\d+)(?:\/download)?\/?$/);
    if (file && file[1] === courseId) return { kind: 'file', path: `/api/v1/files/${file[2]}` };
    const globalFile = url.pathname.match(/^\/files\/(\d+)(?:\/download)?\/?$/);
    if (globalFile) return { kind: 'file', path: `/api/v1/files/${globalFile[1]}` };
    return null;
  } catch { return null; }
}

async function boundedBytes(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get('Content-Length')) > MAX_FILE_BYTES) throw new Error('File exceeds the 12 MB reading limit.');
  if (!response.body) throw new Error('Canvas returned an empty file.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FILE_BYTES) throw new Error('File exceeds the 12 MB reading limit.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

/** Read only published, unlocked course material using the current Canvas session. */
export async function readCanvasMaterials(resources: StudyMaterial[], origin: string, courseId: string, extract: ExtractFile, signal?: AbortSignal): Promise<{ resources: StudyMaterial[]; warnings: string[] }> {
  const warnings: string[] = [];
  const result: StudyMaterial[] = [];
  for (const resource of resources.slice(0, 12)) {
    signal?.throwIfAborted();
    if (resource.text?.trim()) { result.push({ ...resource, text: resource.text.slice(0, 22000) }); continue; }
    const endpoint = materialEndpoint(resource.url, origin, courseId);
    if (!endpoint) { result.push(resource); continue; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const metadata = await fetch(origin + endpoint.path, { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!metadata.ok) throw new Error(`Canvas returned HTTP ${metadata.status}.`);
      const record = JSON.parse((await metadata.text()).replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, ''));
      if (record.locked_for_user || record.hidden_for_user || record.published === false) throw new Error('This material is locked or unpublished.');
      if (endpoint.kind === 'page') {
        if (typeof record.body !== 'string') throw new Error('Canvas did not return the page body.');
        result.push({ ...resource, text: canvasHtmlText(record.body).slice(0, 22000) });
      } else {
        if (typeof record.url !== 'string') throw new Error('Canvas did not return a download link.');
        const download = new URL(record.url, origin);
        if (download.protocol !== 'https:' && download.origin !== origin) throw new Error('Canvas returned an unsupported download link.');
        const response = await fetch(download.href, { method: 'GET', credentials: download.origin === origin ? 'include' : 'omit', redirect: 'follow', signal: controller.signal });
        if (!response.ok) throw new Error(`File download returned HTTP ${response.status}.`);
        const bytes = await boundedBytes(response);
        const extracted = await extract({ title: record.display_name || resource.title, mimeType: record['content-type'] || response.headers.get('Content-Type') || 'application/octet-stream', data: base64(bytes) });
        warnings.push(...extracted.warnings.map(w => `${resource.title}: ${w}`));
        result.push({ ...resource, text: extracted.text.slice(0, 22000) });
      }
    } catch (error) {
      signal?.throwIfAborted();
      result.push(resource);
      warnings.push(`${resource.title}: could not read contents (${error instanceof Error ? error.message : 'access unavailable'}). The link is included for reference only.`);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return { resources: result, warnings };
}

/** Discover instruction attachments directly from the selected assignment brief. */
export function assignmentMaterials(html: string, origin: string, courseId: string): StudyMaterial[] {
  if (!/<a\b[^>]*href\s*=/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const materials = new Map<string, StudyMaterial>();
  for (const link of Array.from(doc.querySelectorAll('a[href]'))) {
    const raw = link.getAttribute('href') || '';
    if (!materialEndpoint(raw, origin, courseId)) continue;
    const url = new URL(raw, origin).href;
    materials.set(url, { title: link.textContent?.trim() || 'Assignment instructions', url });
  }
  return [...materials.values()];
}

/** Stable identity for a Canvas attachment, regardless of wrap/download query strings. */
export function materialIdentity(value: string): string {
  try {
    const url = new URL(value);
    const file = url.pathname.match(/^\/(?:api\/v1\/)?(?:courses\/\d+\/)?files\/(\d+)(?:\/download)?\/?$/);
    return file ? `${url.origin}/files/${file[1]}` : url.origin + url.pathname.replace(/\/$/, '');
  } catch { return value; }
}

/** Local replicas retain original Canvas file links. Only the extension may read those. */
export function assignmentInstructionMaterials(html: string, origin: string, courseId: string): StudyMaterial[] {
  if (!/<a\b[^>]*href\s*=/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const captured = new Set(Array.from(doc.querySelectorAll('[data-offcanvas-assignment-source]'))
    .filter(section => section.getAttribute('data-offcanvas-source-complete') !== 'false' && section.querySelector('pre')?.textContent?.trim())
    .map(section => materialIdentity(section.getAttribute('data-offcanvas-assignment-source') || '')));
  const materials = new Map<string, StudyMaterial>();
  const replica = /^http:\/\/(?:127\.0\.0\.1|localhost):8080$/.test(origin);
  for (const link of Array.from(doc.querySelectorAll('a[href]'))) {
    try {
      const url = new URL(link.getAttribute('href') || '', origin);
      const sourceFile = replica && url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        (url.hostname === 'instructure.com' || url.hostname.endsWith('.instructure.com') || url.hostname === 'canvas.usm.edu') &&
        /^\/(?:courses\/\d+\/)?files\/\d+(?:\/download)?\/?$/.test(url.pathname);
      if (!materialEndpoint(url.href, origin, courseId) && !sourceFile) continue;
      const key = materialIdentity(url.href);
      if (captured.has(key)) continue;
      materials.set(key, {title: link.textContent?.trim() || 'Assignment instructions', url: url.href});
    } catch { /* Invalid links are never fetch targets. */ }
  }
  return [...materials.values()];
}
