/**
 * GRADIENT Verified Canvas Read-Only Fetch Wrapper
 * 
 * HARD RULE 1 (NON-NEGOTIABLE):
 * READ-ONLY toward Canvas. All Canvas requests go through this single fetch wrapper
 * that throws on any method except GET. The extension never submits, posts, edits,
 * or answers anything in Canvas.
 * 
 * Features:
 * - Runtime GET-only enforcement (throws CanvasReadOnlyViolationError)
 * - credentials: 'include' (uses student's active Canvas session)
 * - Pagination via RFC 5988 Link headers
 * - Respects rate-limit headers (X-Rate-Limit-Remaining, back-off)
 * - IndexedDB caching with configurable TTL (with in-memory fallback for unit tests)
 * - Observable request logging for the "What Was Fetched" view
 */

export class CanvasReadOnlyViolationError extends Error {
  constructor(attemptedMethod: string) {
    super(
      `[SECURITY VIOLATION] Canvas mutation rejected: Method '${attemptedMethod}' is strictly forbidden. ` +
      `GRADIENT is strictly read-only and never modifies Canvas LMS state.`
    );
    this.name = 'CanvasReadOnlyViolationError';
  }
}

export interface FetchLogEntry {
  id: string;
  timestamp: number;
  url: string;
  method: 'GET';
  status: number;
  fromCache: boolean;
  durationMs: number;
  responseSize: number;
  rateLimitRemaining: number | null;
}

export interface CanvasFetchOptions extends Omit<RequestInit, 'method' | 'body'> {
  method?: 'GET' | 'get';
  /** Time-To-Live in milliseconds for IndexedDB cache (default: 5 minutes / 300_000ms) */
  ttlMs?: number;
  /** Force network fetch and update cache */
  skipCache?: boolean;
  /** Maximum number of retries on 429 rate limit */
  maxRetries?: number;
}

export interface CachedResponse {
  url: string;
  data: any;
  headers: Record<string, string>;
  timestamp: number;
  ttlMs: number;
  size: number;
}

// ---------------------------------------------------------------------------
// 1. Observable Fetch Log Store ("What Was Fetched")
// ---------------------------------------------------------------------------
const fetchLogs: FetchLogEntry[] = [];
const fetchLogListeners: Set<(entry: FetchLogEntry) => void> = new Set();

export function getFetchLogs(): FetchLogEntry[] {
  return [...fetchLogs];
}

export function clearFetchLogs(): void {
  fetchLogs.length = 0;
}

export function onFetchLogged(listener: (entry: FetchLogEntry) => void): () => void {
  fetchLogListeners.add(listener);
  return () => {
    fetchLogListeners.delete(listener);
  };
}

function recordFetchLog(entry: FetchLogEntry): void {
  fetchLogs.unshift(entry); // newest first
  if (fetchLogs.length > 200) {
    fetchLogs.pop();
  }
  for (const listener of fetchLogListeners) {
    try {
      listener(entry);
    } catch {
      // Ignore listener errors
    }
  }
}

// ---------------------------------------------------------------------------
// 2. IndexedDB & In-Memory Cache Store with TTL
// ---------------------------------------------------------------------------
const inMemoryCache = new Map<string, CachedResponse>();
const DB_NAME = 'gradient_cache_db';
const STORE_NAME = 'canvas_responses';
const DB_VERSION = 1;

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return null;
}

async function openCacheDB(): Promise<IDBDatabase | null> {
  const idb = getIndexedDB();
  if (!idb) return null;

  return new Promise((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getCachedResponse(url: string): Promise<CachedResponse | null> {
  const now = Date.now();

  // Try IndexedDB first
  const db = await openCacheDB();
  if (db) {
    try {
      const result = await new Promise<CachedResponse | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });

      if (result) {
        if (now - result.timestamp < result.ttlMs) {
          return result;
        } else {
          // Expired: delete from IndexedDB asynchronously
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(url);
        }
      }
    } catch {
      // Fall through to inMemoryCache
    }
  }

  // Fallback to in-memory store
  const memEntry = inMemoryCache.get(url);
  if (memEntry) {
    if (now - memEntry.timestamp < memEntry.ttlMs) {
      return memEntry;
    } else {
      inMemoryCache.delete(url);
    }
  }

  return null;
}

export async function setCachedResponse(
  url: string,
  data: any,
  headers: Record<string, string>,
  ttlMs: number
): Promise<void> {
  const serialized = JSON.stringify(data);
  const size = new Blob ? new Blob([serialized]).size : serialized.length;
  const entry: CachedResponse = {
    url,
    data,
    headers,
    timestamp: Date.now(),
    ttlMs,
    size,
  };

  inMemoryCache.set(url, entry);

  const db = await openCacheDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
    } catch {
      // Ignore write errors to IDB
    }
  }
}

export function clearCache(): void {
  inMemoryCache.clear();
  const idb = getIndexedDB();
  if (idb) {
    try {
      idb.deleteDatabase(DB_NAME);
    } catch {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Rate-Limit Backoff & Sleep Helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRateLimitHeaders(headers: Headers): {
  remaining: number | null;
  cost: number | null;
} {
  const remHeader = headers.get('X-Rate-Limit-Remaining');
  const costHeader = headers.get('X-Request-Cost');
  const remaining = remHeader !== null ? parseFloat(remHeader) : null;
  const cost = costHeader !== null ? parseFloat(costHeader) : null;
  return { remaining, cost };
}

// ---------------------------------------------------------------------------
// 4. Single canvasFetch Wrapper
// ---------------------------------------------------------------------------

/**
 * Single verified fetch wrapper for all Canvas API requests.
 * 
 * - Enforces GET-only: Throws CanvasReadOnlyViolationError on POST, PUT, DELETE, etc.
 * - Always sends credentials: 'include'
 * - Checks IndexedDB cache first (TTL-based)
 * - Inspects and respects rate-limit headers (X-Rate-Limit-Remaining)
 * - Logs all operations for the "What Was Fetched" view
 */
export interface CanvasFetchResult<T = any> {
  data: T;
  headers: Headers;
  fromCache: boolean;
  ok: boolean;
  status: number;
}

export async function canvasFetch<T = any>(
  input: string | URL,
  options?: CanvasFetchOptions
): Promise<CanvasFetchResult<T>> {
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    throw new CanvasReadOnlyViolationError(method);
  }

  // Reject body on any Canvas request
  if ((options as any)?.body !== undefined && (options as any)?.body !== null) {
    throw new CanvasReadOnlyViolationError('GET_WITH_BODY');
  }

  const urlStr = input.toString();
  const ttlMs = options?.ttlMs ?? 300_000; // Default 5 minutes
  const skipCache = options?.skipCache ?? false;
  const startTime = Date.now();

  // 1. Check Cache
  if (!skipCache) {
    const cached = await getCachedResponse(urlStr);
    if (cached) {
      const headers = new Headers(cached.headers);
      recordFetchLog({
        id: `cache_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        url: urlStr,
        method: 'GET',
        status: 200,
        fromCache: true,
        durationMs: Date.now() - startTime,
        responseSize: cached.size,
        rateLimitRemaining: null,
      });
      return { data: cached.data as T, headers, fromCache: true, ok: true, status: 200 };
    }
  }

  // 2. Prepare network fetch
  const reqHeaders = new Headers(options?.headers);
  if (!reqHeaders.has('Accept')) {
    reqHeaders.set('Accept', 'application/json');
  }

  const fetchInit: RequestInit = {
    ...options,
    method: 'GET',
    credentials: 'include', // Canvas session cookie authentication
    headers: reqHeaders,
  };

  const maxRetries = options?.maxRetries ?? 2;
  let attempt = 0;
  let response: Response;

  while (true) {
    attempt++;
    response = await fetch(urlStr, fetchInit);

    // 3. Rate Limit Header Evaluation
    const { remaining } = parseRateLimitHeaders(response.headers);

    // If remaining rate limit is low (< 50.0), introduce mild back-off
    if (remaining !== null && remaining < 50.0 && remaining > 0) {
      const backoffDelay = Math.min((50.0 - remaining) * 20, 2000);
      await sleep(backoffDelay);
    }

    // Handle 429 Too Many Requests or Rate Limit Error
    if (response.status === 429 || (response.status === 403 && response.headers.get('X-Rate-Limit-Remaining') === '0')) {
      if (attempt <= maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.pow(2, attempt) * 500;
        await sleep(waitMs);
        continue;
      }
    }

    break;
  }

  const durationMs = Date.now() - startTime;
  const { remaining: finalRemaining } = parseRateLimitHeaders(response.headers);

  if (!response.ok) {
    recordFetchLog({
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      url: urlStr,
      method: 'GET',
      status: response.status,
      fromCache: false,
      durationMs,
      responseSize: 0,
      rateLimitRemaining: finalRemaining,
    });
    throw new Error(`Canvas API HTTP ${response.status} ${response.statusText} for ${urlStr}`);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const responseSize = new Blob ? new Blob([text]).size : text.length;

  // 4. Save to Cache
  const headerRecord: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headerRecord[k] = v;
  });
  await setCachedResponse(urlStr, data, headerRecord, ttlMs);

  // 5. Log Request
  recordFetchLog({
    id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    url: urlStr,
    method: 'GET',
    status: response.status,
    fromCache: false,
    durationMs,
    responseSize,
    rateLimitRemaining: finalRemaining,
  });

  return { data, headers: response.headers, fromCache: false, ok: response.ok, status: response.status };
}

// ---------------------------------------------------------------------------
// 5. Pagination Helper via Link Headers
// ---------------------------------------------------------------------------

export function extractNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const links = linkHeader.split(',');
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === 'next') {
      return match[1] ?? null;
    }
  }
  return null;
}

/**
 * Fetch all paginated records from a Canvas endpoint via RFC 5988 Link headers.
 */
export async function canvasFetchAllPages<T = any>(
  initialUrl: string | URL,
  options?: CanvasFetchOptions & { maxPages?: number }
): Promise<T[]> {
  const maxPages = options?.maxPages ?? 10;
  const results: T[] = [];
  let currentUrl: string | null = initialUrl.toString();
  let pagesFetched = 0;

  while (currentUrl && pagesFetched < maxPages) {
    const { data, headers } = await canvasFetch<any>(currentUrl, options);
    pagesFetched++;

    if (Array.isArray(data)) {
      results.push(...data);
    } else if (data !== null && data !== undefined) {
      results.push(data);
      break;
    }

    currentUrl = extractNextLink(headers.get('Link'));
  }

  return results;
}
