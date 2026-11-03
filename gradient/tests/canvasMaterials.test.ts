import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialEndpoint, readCanvasMaterials } from '../extension/canvasMaterials.js';

const ORIGIN = 'https://school.instructure.com';
const file = { title: 'Lecture notes', url: `${ORIGIN}/courses/10/files/100` };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('Canvas material URL isolation', () => {
  it('maps only the current course pages and declared Canvas file routes to read-only API paths', () => {
    expect(materialEndpoint(`${ORIGIN}/courses/10/pages/lecture%20notes`, ORIGIN, '10')).toEqual({ kind: 'page', path: '/api/v1/courses/10/pages/lecture%20notes' });
    expect(materialEndpoint('/courses/10/files/100/download?download_frd=1', ORIGIN, '10')).toEqual({ kind: 'file', path: '/api/v1/files/100' });
    expect(materialEndpoint('/files/100/download', ORIGIN, '10')).toEqual({ kind: 'file', path: '/api/v1/files/100' });
  });

  it.each([
    'https://attacker.example/courses/10/files/100', '//attacker.example/courses/10/pages/notes',
    '/courses/11/files/100', '/courses/11/pages/notes', '/api/v1/courses/10/settings',
    '/courses/10/assignments/20', '/courses/10/files/not-a-file', '/courses/10/pages/notes/history',
    '/courses/10/pages/..%2Fsettings', '/courses/10/pages/..%5Csettings', '/courses/10/pages/%252e%252e%252fsettings',
    'javascript:alert(1)', 'data:text/plain,notes',
  ])('does not fetch materials outside the permitted source route %s', url => {
    expect(materialEndpoint(url, ORIGIN, '10')).toBeNull();
  });
});

describe('Canvas file reading', () => {
  it.each([{ locked_for_user: true }, { hidden_for_user: true }, { published: false }])('does not download or extract restricted file metadata %j', async restriction => {
    const fetch = vi.fn(async () => json({ ...restriction, url: `${ORIGIN}/files/100/download` }));
    const extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(extract).not.toHaveBeenCalled();
    expect(result.resources).toEqual([file]);
    expect(result.warnings[0]).toContain('locked or unpublished');
  });

  it('keeps cross-course and external links as references without requesting them with Canvas credentials', async () => {
    const fetch = vi.fn(), extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const resources = [{ title: 'Other course', url: `${ORIGIN}/courses/11/files/100` }, { title: 'Web notes', url: 'https://notes.example/notes' }];
    expect((await readCanvasMaterials(resources, ORIGIN, '10', extract)).resources).toEqual(resources);
    expect(fetch).not.toHaveBeenCalled(); expect(extract).not.toHaveBeenCalled();
  });

  it('uses the signed download URL without Canvas credentials when its origin differs', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ url: 'https://files.example.edu/signed-notes', display_name: 'Notes.pdf', 'content-type': 'application/pdf' }))
      .mockResolvedValueOnce(new Response(new Uint8Array([37, 80, 68, 70]), { headers: { 'Content-Type': 'application/pdf' } }));
    const extract = vi.fn(async () => ({ text: 'Extracted notes', warnings: [] })); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(fetch).toHaveBeenNthCalledWith(1, `${ORIGIN}/api/v1/files/100`, expect.objectContaining({ method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store' }));
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://files.example.edu/signed-notes', expect.objectContaining({ method: 'GET', credentials: 'omit' }));
    expect(extract).toHaveBeenCalledWith({ title: 'Notes.pdf', mimeType: 'application/pdf', data: 'JVBERg==' });
    expect(result.resources[0]?.text).toBe('Extracted notes');
  });

  it('rejects insecure cross-origin download URLs before downloading bytes', async () => {
    const fetch = vi.fn(async () => json({ url: 'http://192.168.1.20/private' }));
    const extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(fetch).toHaveBeenCalledTimes(1); expect(extract).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain('unsupported download link');
  });

  it('continues with reference-only material after an API access failure', async () => {
    const fetch = vi.fn(async () => json({ error: 'access denied' }, 403));
    const extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(result.resources).toEqual([file]);
    expect(result.warnings[0]).toContain('HTTP 403'); expect(extract).not.toHaveBeenCalled();
  });

  it('rejects large advertised downloads before extraction', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ url: `${ORIGIN}/files/100/download` }))
      .mockResolvedValueOnce(new Response('oversized', { headers: { 'Content-Length': String(12 * 1024 * 1024 + 1) } }));
    const extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(result.warnings[0]).toContain('12 MB'); expect(extract).not.toHaveBeenCalled();
  });

  it('enforces the byte limit while streaming even when Content-Length is absent', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(12 * 1024 * 1024 + 1)); controller.close(); } });
    const fetch = vi.fn().mockResolvedValueOnce(json({ url: `${ORIGIN}/files/100/download` })).mockResolvedValueOnce(new Response(stream));
    const extract = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(result.warnings[0]).toContain('12 MB'); expect(extract).not.toHaveBeenCalled();
  });

  it('handles Canvas anti-hijacking JSON prefix and preserves extraction warnings', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(`while(1);${JSON.stringify({ url: `${ORIGIN}/files/100/download` })}`))
      .mockResolvedValueOnce(new Response('notes'));
    const extract = vi.fn(async () => ({ text: 'Read these notes', warnings: ['Some scanned pages need OCR.'] }));
    vi.stubGlobal('fetch', fetch);
    const result = await readCanvasMaterials([file], ORIGIN, '10', extract);
    expect(result.resources[0]?.text).toBe('Read these notes');
    expect(result.warnings).toEqual(['Lecture notes: Some scanned pages need OCR.']);
  });
});
