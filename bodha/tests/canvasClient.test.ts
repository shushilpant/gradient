import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeCanvasFetch,
  CanvasReadOnlyViolationError,
  CanvasClient,
} from '../extension/canvasClient.js';

describe('Canvas Read-Only Fetch Wrapper (Hard Rule 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects POST requests with CanvasReadOnlyViolationError', async () => {
    await expect(
      safeCanvasFetch('https://canvas.test/api/v1/courses/101/assignments', {
        method: 'POST',
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('rejects PUT requests with CanvasReadOnlyViolationError', async () => {
    await expect(
      safeCanvasFetch('https://canvas.test/api/v1/courses/101/assignments/1', {
        method: 'PUT',
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('rejects DELETE requests with CanvasReadOnlyViolationError', async () => {
    await expect(
      safeCanvasFetch('https://canvas.test/api/v1/courses/101/assignments/1', {
        method: 'DELETE',
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('rejects PATCH requests with CanvasReadOnlyViolationError', async () => {
    await expect(
      safeCanvasFetch('https://canvas.test/api/v1/courses/101/submissions/1', {
        method: 'PATCH',
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('rejects any request that includes a body', async () => {
    await expect(
      safeCanvasFetch('https://canvas.test/api/v1/courses/101', {
        method: 'GET',
        body: JSON.stringify({ malicious: 'submission' }),
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('allows safe GET requests with credentials: include and JSON headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'Canvas Test Course' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = mockFetch;

    const res = await safeCanvasFetch('https://canvas.test/api/v1/courses/101');
    expect(res.ok).toBe(true);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs![1].method).toBe('GET');
    expect(callArgs![1].credentials).toBe('include');
    expect(callArgs![1].headers.get('Accept')).toBe('application/json');
  });

  it('CanvasClient performs typed GET queries and builds correct URLs', async () => {
    const mockData = [{ id: 1, name: 'Assignments' }];
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new CanvasClient('https://canvas.test');
    const result = await client.get<typeof mockData>('/api/v1/courses/101/assignment_groups', {
      per_page: 50,
    });

    expect(result).toEqual(mockData);
  });
});

