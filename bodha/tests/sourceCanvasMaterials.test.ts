import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCanvasFileInTab } from '../extension/sourceCanvasTab.js';
vi.mock('../extension/sourceCanvasTab.js', () => ({readCanvasFileInTab: vi.fn()}));
import { readSourceCanvasMaterials } from '../extension/sourceCanvasMaterials.js';

const backendUrl = 'http://127.0.0.1:8765';
const sender = 'http://127.0.0.1:8080/courses/4/assignments/5';
const origin = 'https://usm.instructure.com';
const attachment = { title: 'CE 240 Homework 5 Fall 2026.pdf', url: origin + '/courses/126231/files/13845103?wrap=1' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('Original Canvas attachment relay', () => {
  it.each(['https://usm.instructure.com/courses/1', 'http://127.0.0.1:8086/', 'https://evil.example/', 'http://localhost:8080.evil.example/', 'http://user:secret@localhost:8080/'])('rejects an unauthorized sender %s before fetching', async senderUrl => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(readSourceCanvasMaterials({ backendUrl, resources: [attachment] }, senderUrl)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'http://usm.instructure.com/courses/1/files/2', 'https://usm.instructure.com.evil.example/courses/1/files/2',
    'https://evil.example/courses/1/files/2', 'https://usm.instructure.com:8443/files/2',
    'https://user:secret@usm.instructure.com/files/2', 'https://usm.instructure.com/courses/1/pages/private',
    'https://usm.instructure.com/api/v1/users/self', 'file:///private/file.pdf', '/files/2',
  ])('rejects a target outside a Canvas attachment route %s', async url => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(readSourceCanvasMaterials({ backendUrl, resources: [{ ...attachment, url }] }, sender)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads using the existing Canvas session and sends only file bytes to the local extractor', async () => {
    const question = '1. Find the inverse Laplace transform of F(s) = 1/(s+2).';
    vi.mocked(readCanvasFileInTab).mockResolvedValue({title:attachment.title,mimeType:'application/pdf',data:btoa('%PDF-1.4\nExplicit homework bytes')});
    const fetch = vi.fn<typeof globalThis.fetch>(async (value, options) => {
      expect(value).toBe(backendUrl + '/api/v1/assistant/materials/extract');
      expect(options?.credentials).toBe('omit');
      expect(JSON.parse(String(options?.body))).toEqual({ title: attachment.title, mimeType: 'application/pdf', data: btoa('%PDF-1.4\nExplicit homework bytes') });
      return json({ text: question, warnings: [] });
    });
    vi.stubGlobal('fetch', fetch);
    const result = await readSourceCanvasMaterials({ backendUrl, resources: [{ ...attachment, text: 'Do not trust caller-provided text.' }] }, sender);
    expect(result.resources).toEqual([{ ...attachment, text: question }]);
    expect(result.warnings).toEqual([]);
    expect(readCanvasFileInTab).toHaveBeenCalledWith({origin,courseId:'126231',resource:attachment}, {});
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns a visible unread warning when the original Canvas session is unavailable', async () => {
    vi.mocked(readCanvasFileInTab).mockRejectedValue(new Error('Sign in to the source Canvas tab (HTTP 401).'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await readSourceCanvasMaterials({ backendUrl, resources: [attachment] }, sender);
    expect(result.resources).toEqual([attachment]);
    expect(result.warnings[0]).toContain('HTTP 401');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized batches and remote extraction backends before fetching', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(readSourceCanvasMaterials({ backendUrl, resources: Array(13).fill(attachment) }, sender)).rejects.toThrow();
    await expect(readSourceCanvasMaterials({ backendUrl: 'https://evil.example', resources: [attachment] }, sender)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
