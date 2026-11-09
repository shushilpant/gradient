import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canvasFetch,
  canvasFetchAllPages,
  CanvasReadOnlyViolationError,
  getFetchLogs,
  clearFetchLogs,
  clearCache,
} from '../extension/canvasFetch.js';

describe('canvasFetch Read-Only Wrapper & Cache (Stage 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearFetchLogs();
    clearCache();
  });

  it('strictly throws CanvasReadOnlyViolationError on POST, PUT, DELETE, PATCH', async () => {
    const invalidMethods = ['POST', 'PUT', 'DELETE', 'PATCH', 'post', 'put'];
    for (const method of invalidMethods) {
      await expect(
        canvasFetch('https://canvas.test/api/v1/courses/1/assignments', {
          method: method as any,
        })
      ).rejects.toThrow(CanvasReadOnlyViolationError);
    }
  });

  it('strictly throws CanvasReadOnlyViolationError when request body is provided', async () => {
    await expect(
      canvasFetch('https://canvas.test/api/v1/courses/1', {
        method: 'GET',
        body: JSON.stringify({ malicious: 'write' }),
      } as any)
    ).rejects.toThrow(CanvasReadOnlyViolationError);
  });

  it('includes credentials: include on all requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 101, name: 'CS 101' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = mockFetch;

    await canvasFetch('https://canvas.test/api/v1/courses/101');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs![1].credentials).toBe('include');
    expect(callArgs![1].method).toBe('GET');
  });

  it('caches responses in store and serves subsequent calls within TTL from cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 201, name: 'Cached Course' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Rate-Limit-Remaining': '590.0',
        },
      })
    );
    global.fetch = mockFetch;

    const url = 'https://canvas.test/api/v1/courses/201';

    // Call 1: Network fetch
    const res1 = await canvasFetch(url, { ttlMs: 60_000 });
    expect(res1.fromCache).toBe(false);
    expect(res1.data).toEqual({ id: 201, name: 'Cached Course' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Call 2: Should hit cache within TTL
    const res2 = await canvasFetch(url, { ttlMs: 60_000 });
    expect(res2.fromCache).toBe(true);
    expect(res2.data).toEqual({ id: 201, name: 'Cached Course' });
    expect(mockFetch).toHaveBeenCalledTimes(1); // No new network call!
  });

  it('logs every request to the "what was fetched" view with audit metadata', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Rate-Limit-Remaining': '580.5',
        },
      })
    );

    await canvasFetch('https://canvas.test/api/v1/courses/101/assignments');
    const logs = getFetchLogs();
    expect(logs.length).toBe(1);
    const entry = logs[0]!;
    expect(entry.url).toBe('https://canvas.test/api/v1/courses/101/assignments');
    expect(entry.method).toBe('GET');
    expect(entry.status).toBe(200);
    expect(entry.fromCache).toBe(false);
    expect(entry.rateLimitRemaining).toBe(580.5);
    expect(typeof entry.durationMs).toBe('number');
  });

  it('paginates via RFC 5988 Link headers with canvasFetchAllPages', async () => {
    const page1Data = [{ id: 1, name: 'HW 1' }];
    const page2Data = [{ id: 2, name: 'HW 2' }];

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1Data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Link': '<https://canvas.test/api/v1/courses/101/assignments?page=2>; rel="next"',
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2Data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    global.fetch = mockFetch;

    const all = await canvasFetchAllPages('https://canvas.test/api/v1/courses/101/assignments', { skipCache: true });
    expect(all).toEqual([...page1Data, ...page2Data]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

