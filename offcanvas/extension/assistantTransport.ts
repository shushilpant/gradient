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
  const computerGet = method === 'GET' && /^\/api\/v1\/computer\/(config|sessions\/[a-zA-Z0-9_-]{1,80})$/.test(path);
  const computerPost = method === 'POST' && /^\/api\/v1\/computer\/(mirror|sessions|sessions\/[a-zA-Z0-9_-]{1,80}\/cancel)$/.test(path);
  const get = method === 'GET' && (/^\/api\/v1\/assistant\/health$/.test(path) || /^\/api\/v1\/assistant\/jobs\/[a-zA-Z0-9_-]{1,80}$/.test(path));
  const post = method === 'POST' && /^\/api\/v1\/assistant\/(shares(?:\/[a-zA-Z0-9_-]{32}\/revoke)?|export\/pdf|models\/pull|reu\/search|generate|browser\/plan|materials\/extract|jobs)$/.test(path);
  if (!get && !post && !computerGet && !computerPost) throw new Error('This local assistant operation is not supported.');
}

export const EXTENSION_RELOAD_MESSAGE = 'OffCanvas was updated while this Canvas tab was open. Refresh this Canvas page to reconnect, then retry the workflow.';
export class ExtensionReloadRequired extends Error {
  constructor() { super(EXTENSION_RELOAD_MESSAGE); this.name = 'ExtensionReloadRequired'; }
}
export function invalidatedExtension(error:unknown):boolean {
  return error instanceof ExtensionReloadRequired || (error instanceof Error && /extension context invalidated/i.test(error.message));
}
export function assertLiveExtension(): void {
  if (typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function' && !chrome.runtime.id) throw new ExtensionReloadRequired();
}

/** A stale content script can still reach the loopback service after reload. */
export async function assistantRequest(backendUrl:string,path:string,method:'GET'|'POST',body?:unknown):Promise<any> {
  validateBackendUrl(backendUrl);validateAssistantPath(path,method);
  if(typeof chrome!=='undefined'&&typeof chrome.runtime?.sendMessage==='function') {
    try {
      const response=await chrome.runtime.sendMessage({type:'OFFCANVAS_ASSISTANT_REQUEST',backendUrl,path,method,body});
      if(!response?.ok)throw new Error(response?.error||'The local assistant request failed.');
      return response.data;
    }catch(error){if(!invalidatedExtension(error))throw error;}
  }
  return localAssistantFetch(backendUrl,path,method,body);
}

export async function localAssistantFetch(backendUrl: string, path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
  const origin = validateBackendUrl(backendUrl);
  validateAssistantPath(path, method);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path === "/api/v1/assistant/reu/search" ? 90000 : 24000);
  try {
    const response = await fetch(origin + path, {
      method, headers: { 'Content-Type': 'application/json', 'X-OffCanvas-Client': 'offcanvas-extension' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      if (Array.isArray(detail)) {
        if (path === '/api/v1/assistant/jobs' && detail.some(issue => issue?.loc?.join('.') === 'body.type' && issue?.type === 'literal_error')) {
          throw new Error('The local AI service is outdated. Restart the backend, then retry.');
        }
        const issues = detail.slice(0, 3).map(issue => {
          const field = Array.isArray(issue?.loc) ? issue.loc.filter((part: unknown) => part !== 'body').join('.') : 'request';
          return `${field}: ${typeof issue?.msg === 'string' ? issue.msg : 'invalid value'}`;
        });
        throw new Error(`The local assistant could not accept the request. ${issues.join('; ')}`);
      }
      throw new Error(typeof detail === 'string' ? detail : `The local assistant returned HTTP ${response.status}.`);
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The local assistant took too long to respond. Check that the service is running.');
    if (error instanceof TypeError) throw new Error('Cannot reach the local AI service. Start it on 127.0.0.1:8765, then check the connection.');
    throw error;
  } finally { clearTimeout(timeout); }
}
