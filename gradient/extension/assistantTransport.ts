/** Only the local companion service is reachable through the extension relay. */
export function validateBackendUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a local backend URL, for example http://127.0.0.1:8765.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('The AI backend must be an HTTP service on localhost.');
  }
  return url.origin;
}

export function validateAssistantPath(path: string, method: string): void {
  const get = method === 'GET' && (/^\/api\/v1\/assistant\/health$/.test(path) || /^\/api\/v1\/assistant\/jobs\/[a-zA-Z0-9_-]{1,80}$/.test(path));
  const post = method === 'POST' && /^\/api\/v1\/assistant\/(models\/pull|generate|browser\/plan|materials\/extract|jobs)$/.test(path);
  if (!get && !post) throw new Error('This local assistant operation is not supported.');
}

export async function localAssistantFetch(backendUrl: string, path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
  const origin = validateBackendUrl(backendUrl);
  validateAssistantPath(path, method);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(origin + path, {
      method, headers: { 'Content-Type': 'application/json', 'X-Gradient-Client': 'gradient-extension' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      throw new Error(typeof detail === 'string' ? detail : `The local assistant returned HTTP ${response.status}.`);
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The local assistant took too long to respond. Check that the service is running.');
    if (error instanceof TypeError) throw new Error('Cannot reach the local AI service. Start it on 127.0.0.1:8765, then check the connection.');
    throw error;
  } finally { clearTimeout(timeout); }
}
