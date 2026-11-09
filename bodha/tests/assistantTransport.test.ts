import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantRequest, localAssistantFetch, validateAssistantPath, validateBackendUrl } from '../extension/assistantTransport.js';
import { applyBrowserAction, safeBrowserUrl, planBrowserAction } from '../extension/assistantClient.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('local assistant relay boundaries', () => {
  it('normalizes only a plain loopback HTTP origin', () => {
    expect(validateBackendUrl('http://127.0.0.1:8765/')).toBe('http://127.0.0.1:8765');
    expect(validateBackendUrl('http://localhost:8765')).toBe('http://localhost:8765');
  });

  it.each([
    'https://127.0.0.1:8765', 'http://192.168.1.5:8765', 'http://0.0.0.0:8765',
    'http://localhost.attacker.example:8765', 'http://127.0.0.1.attacker.example:8765',
    'http://localhost@attacker.example', 'http://user:secret@localhost:8765',
    'http://localhost:8765/api', 'http://localhost:8765/?target=http://attacker.example',
    'http://localhost:8765/#http://attacker.example', 'file:///tmp/socket', 'invalid url',
  ])('rejects remote, credentialed, and path-bearing backend URL %s', url => {
    expect(() => validateBackendUrl(url)).toThrow();
  });

  it.each([
    ['/api/v1/assistant/health', 'POST'], ['/api/v1/assistant/generate', 'GET'],
    ['/api/v1/assistant/models/pull', 'DELETE'], ['/api/v1/assistant/jobs', 'GET'],
    ['/api/v1/assistant/jobs/../../admin', 'GET'], ['/api/v1/assistant/jobs/a?url=http://evil.example', 'GET'],
    ['/api/v1/assistant/health#fragment', 'GET'], ['/api/v1/assistant/health/../generate', 'POST'],
    ['//evil.example/api/v1/assistant/health', 'GET'], ['https://evil.example/api/v1/assistant/health', 'GET'],
    ['/api/v1/assistant/%68ealth', 'GET'], ['/api/v1/assistant/jobs/%2e%2e', 'GET'],
    ['/api/v1/assistant/jobs/one/two', 'GET'], ['/api/v1/assistant/jobs/' + 'x'.repeat(81), 'GET'],
  ])('rejects unsupported relay route %s with %s', (path, method) => {
    expect(() => validateAssistantPath(path, method)).toThrow();
  });

  it('permits only the bounded assistant operations needed by the UI', () => {
    expect(() => validateAssistantPath('/api/v1/assistant/health', 'GET')).not.toThrow();
    expect(() => validateAssistantPath('/api/v1/assistant/jobs/ab_CD-123', 'GET')).not.toThrow();
    for (const route of ['models/pull', 'generate', 'browser/plan', 'materials/extract', 'jobs']) {
      expect(() => validateAssistantPath(`/api/v1/assistant/${route}`, 'POST')).not.toThrow();
    }
  });

  it('sends JSON with no cookies, redirects or HTTP cache and returns the response', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'job_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await localAssistantFetch('http://localhost:8765/', '/api/v1/assistant/jobs', 'POST', { type: 'generate' })).toEqual({ id: 'job_1' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:8765/api/v1/assistant/jobs', expect.objectContaining({
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      body: '{"type":"generate"}', headers: { 'Content-Type': 'application/json', 'X-Bodha-Client': 'bodha-extension' },
    }));
  });

  it('validates the origin and route before making any request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(localAssistantFetch('http://remote.example', '/api/v1/assistant/health', 'GET')).rejects.toThrow('localhost');
    await expect(localAssistantFetch('http://localhost:8765', '/api/v1/assistant/../health', 'GET')).rejects.toThrow('not supported');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a useful backend error and handles non-JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'The selected model is not installed.' }), { status: 503 })));
    await expect(localAssistantFetch('http://localhost:8765', '/api/v1/assistant/health', 'GET')).rejects.toThrow('not installed');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>unavailable</html>', { status: 502 })));
    await expect(localAssistantFetch('http://localhost:8765', '/api/v1/assistant/health', 'GET')).rejects.toThrow('HTTP 502');
  });

  it('aborts a hung local service before the MV3 fetch deadline', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const request = localAssistantFetch('http://localhost:8765', '/api/v1/assistant/health', 'GET');
    const assertion = expect(request).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(24000);
    await assertion;
    expect((fetch.mock.calls[0]?.[1].signal as AbortSignal).aborted).toBe(true);
  });

  it('identifies an outdated backend without reflecting request contents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({detail:[{loc:['body','type'],type:'literal_error',msg:'Unsupported type',input:'private content'}]}), {status:422})));
    await expect(localAssistantFetch('http://localhost:8765', '/api/v1/assistant/jobs', 'POST', {type:'explain'})).rejects.toThrow('Restart the backend');
  });

  it('shows validation fields instead of a bare HTTP 422', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({detail:[{loc:['body','model'],type:'missing',msg:'Field required',input:'private content'}]}), {status:422})));
    await expect(localAssistantFetch('http://localhost:8765', '/api/v1/assistant/jobs', 'POST', {})).rejects.toThrow('model: Field required');
  });
});

describe('user-invoked browser actions', () => {
  const setup = () => {
    const browser = { location: { href: 'https://school.instructure.com/courses/10/assignments/20' }, open: vi.fn(), scrollBy: vi.fn(), innerHeight: 800 };
    vi.stubGlobal('window', browser); return browser;
  };
  it('resolves normal course resources and rejects active URL protocols and credentials', () => {
    setup();
    expect(safeBrowserUrl('/courses/10/files/100')).toBe('https://school.instructure.com/courses/10/files/100');
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'https://user:secret@example.com']) expect(() => safeBrowserUrl(url)).toThrow();
  });

  it.each([
    '/courses/10/quizzes/20/take', '/courses/10/quizzes/20/resume', '/courses/10/assessments/20/take',
    '/logout', '/login/logout', '/courses/10/assignments/20/submissions',
    '/courses/10/quizzes/20/%74ake', '/courses/10/assignments/20/%73ubmissions',
  ])('rejects restricted Canvas route %s including encoded routes', path => {
    setup(); expect(() => safeBrowserUrl(path)).toThrow();
  });

  it('never opens a model-provided unsafe URL and uses a separate isolated tab for safe links', async () => {
    const browser = setup();
    await expect(applyBrowserAction({ kind: 'open', description: 'bad link', url: 'javascript:alert(1)' })).rejects.toThrow();
    expect(browser.open).not.toHaveBeenCalled();
    await applyBrowserAction({ kind: 'read', description: 'Read the notes', url: '/courses/10/pages/notes' });
    expect(browser.open).toHaveBeenCalledWith('https://school.instructure.com/courses/10/pages/notes', '_blank', 'noopener,noreferrer');
  });
});

describe('bounded local computer-agent relay paths',()=>{
  it('allows only config, sessions and cancellation endpoints',async()=>{
    const {validateAssistantPath}=await import('../extension/assistantTransport.js');
    expect(()=>validateAssistantPath('/api/v1/computer/config','GET')).not.toThrow();
    expect(()=>validateAssistantPath('/api/v1/computer/sessions/abc-123','GET')).not.toThrow();
    expect(()=>validateAssistantPath('/api/v1/computer/sessions','POST')).not.toThrow();
    expect(()=>validateAssistantPath('/api/v1/computer/sessions/abc-123/cancel','POST')).not.toThrow();
    for(const path of ['/api/v1/computer/shell','/api/v1/computer/sessions/../config','/api/v1/computer/sessions/abc/artifacts/private','/api/v1/computer/config?origin=https://attacker.example'])expect(()=>validateAssistantPath(path,'POST')).toThrow();
  });
});


describe('browser plan optional targets', () => {
  it('normalizes backend null targets while preserving typed action fields', async () => {
    vi.stubGlobal('chrome', {runtime:{sendMessage:vi.fn(async(message) => ({ok:true,data:message.path.endsWith('/jobs') ? {id:'null-targets'} : {status:'complete',result:{summary:'Navigate',actions:[{kind:'open',description:'Course',url:'http://127.0.0.1:8080/courses/1',text:null},{kind:'scroll',description:'Continue',url:null,text:null}],warnings:[]}}}))}});
    const result=await planBrowserAction({backendUrl:'http://127.0.0.1:8765',reasoningModel:'gpt-oss:20b',visionModel:'gemma4:e4b',detailLevel:'a_bit',webResearch:false},{goal:'Find homework',url:'http://127.0.0.1:8080/',title:'Canvas',text:'Courses',model:'gpt-oss:20b'});
    expect(result.actions[0]?.text).toBeUndefined();
    expect(result.actions[0]?.url).toBe('http://127.0.0.1:8080/courses/1');
    expect(result.actions[1]?.url).toBeUndefined();
  });
});


describe('extension reload recovery',()=>{
 it('falls back to the local service only when Chrome invalidates the context',async()=>{
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn().mockRejectedValue(new Error('Extension context invalidated.'))}});
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',fetch);
  expect(await assistantRequest('http://127.0.0.1:8765','/api/v1/computer/config','GET')).toEqual({ok:true});
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not retry unrelated failures',async()=>{
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn().mockRejectedValue(new Error('Generation failed'))}});
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(assistantRequest('http://127.0.0.1:8765','/api/v1/assistant/jobs','POST',{})).rejects.toThrow('Generation failed');
  expect(fetch).not.toHaveBeenCalled();
 });
});
