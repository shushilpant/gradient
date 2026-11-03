import { z } from 'zod';
import type { AssistantSettings, AssistantHealth, StudyRequest, StudyPacket, BrowserPlanRequest, BrowserPlan, BrowserAction } from './assistantTypes.js';
import { localAssistantFetch, validateBackendUrl } from './assistantTransport.js';
import { readCanvasMaterials } from './canvasMaterials.js';
export type * from './assistantTypes.js';

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  backendUrl: 'http://127.0.0.1:8765', reasoningModel: 'gpt-oss:20b', visionModel: 'gemma4:e4b', detailLevel: 'a_bit_more', webResearch: true,
};
const SETTINGS_KEY = 'gradient_assistant_settings';
const settingsSchema = z.object({
  backendUrl: z.string().transform(validateBackendUrl), reasoningModel: z.string().min(1).max(200),
  visionModel: z.string().min(1).max(100), detailLevel: z.enum(['a_bit', 'a_bit_more', 'all_in']), webResearch: z.boolean(),
});
const packetSchema = z.object({
  title: z.string().max(1000), summary: z.string().max(10000), markdown: z.string().max(200000), sampleMarkdown: z.string().max(200000),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string(), excerpt: z.string().optional(), kind: z.enum(['canvas', 'web']).optional() })).max(80),
  diagrams: z.array(z.object({ title: z.string(), nodes: z.array(z.object({ id: z.string(), label: z.string() })).max(20), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).max(40) })).max(10),
  graphs: z.array(z.object({ title: z.string(), xLabel: z.string().optional(), yLabel: z.string().optional(), points: z.array(z.object({ label: z.string(), value: z.number().finite() })).max(100) })).max(10),
  images: z.array(z.object({ title: z.string(), url: z.string(), alt: z.string(), sourceUrl: z.string() })).max(20),
  warnings: z.array(z.string()).max(100), checklist: z.array(z.string()).optional(), generatedAt: z.string().optional(),
});

function extensionAvailable(): boolean { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; }

async function sendMessage(message: unknown): Promise<any> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension could not complete this operation. Reload the extension and Canvas tab.');
  return response.data;
}

async function request(settings: AssistantSettings, path: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const backendUrl = validateBackendUrl(settings.backendUrl);
  if (extensionAvailable()) return sendMessage({ type: 'GRADIENT_ASSISTANT_REQUEST', backendUrl, path: `/api/v1/assistant/${path}`, method, body });
  return localAssistantFetch(backendUrl, `/api/v1/assistant/${path}`, method, body);
}

export async function loadAssistantSettings(): Promise<AssistantSettings> {
  let saved: unknown;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  else if (typeof localStorage !== 'undefined') {
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { saved = {}; }
  }
  const parsed = settingsSchema.safeParse({ ...DEFAULT_ASSISTANT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) });
  return parsed.success ? parsed.data : { ...DEFAULT_ASSISTANT_SETTINGS };
}

let settingsWrite: Promise<unknown> = Promise.resolve();
export function saveAssistantSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const write = settingsWrite.catch(() => {}).then(async () => {
    const next = settingsSchema.parse({ ...await loadAssistantSettings(), ...patch });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    else if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  });
  settingsWrite = write;
  return write;
}

export async function getAssistantHealth(settings: AssistantSettings): Promise<AssistantHealth> {
  return z.object({
    ok: z.boolean(), ollamaConnected: z.boolean(), models: z.array(z.string()), message: z.string().optional(), pullStates: z.record(z.string()).optional(),
    modelDetails: z.array(z.object({ name: z.string(), size: z.number(), capabilities: z.array(z.string()), parameterSize: z.string().optional(), quantization: z.string().optional(), remote: z.boolean().optional() })).optional(),
    recommended: z.object({ reasoningModel: z.string(), visionModel: z.string(), reason: z.string().optional(), contextLength: z.number().optional() }).optional(),
  }).parse(await request(settings, 'health', 'GET'));
}

export async function pullAssistantModel(settings: AssistantSettings, model: string): Promise<void> {
  await request(settings, 'models/pull', 'POST', { model });
}

/** Poll short requests so MV3's 30-second fetch limit never interrupts local inference. */
async function runJob(settings: AssistantSettings, type: 'generate' | 'browser', input: StudyRequest | BrowserPlanRequest): Promise<unknown> {
  const job = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).parse(await request(settings, 'jobs', 'POST', { type, request: input }));
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    const state = await request(settings, `jobs/${job.id}`, 'GET');
    if (state.status === 'complete') return state.result;
    if (state.status === 'error') throw new Error(state.error || 'Local model generation failed.');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Generation exceeded 15 minutes. Try a smaller installed model or a lower detail level.');
}

export async function enableBrowserSearch(): Promise<boolean> {
  if (!extensionAvailable()) throw new Error('Browser Google search requires the installed Chrome extension.');
  return (await sendMessage({type:'GRADIENT_ENABLE_SEARCH'})).granted;
}

export async function generateStudyPacket(settings: AssistantSettings, input: StudyRequest): Promise<StudyPacket> {
  let webSources: {title:string;url:string;snippet:string}[] = [];
  const searchWarnings:string[] = [];
  if (input.webResearch && extensionAvailable()) {
    try { webSources = await sendMessage({type:'GRADIENT_BROWSER_SEARCH',query: `${input.assignment.title} tutorial explanation`.slice(0,250),limit:input.level==='all_in'?8:input.level==='a_bit_more'?5:3}); }
    catch(error) { searchWarnings.push(error instanceof Error?error.message:'Browser search was unavailable.'); }
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : new URL(input.assignment.url).origin;
  const materials = await readCanvasMaterials(input.resources, origin, input.course.id,
    file => request(settings, 'materials/extract', 'POST', file));
  const packet = packetSchema.parse(await runJob(settings, 'generate', { ...input, resources: materials.resources, webSources }));
  packet.warnings = [...searchWarnings, ...materials.warnings, ...packet.warnings];
  return packet;
}

export async function captureBrowserContext(): Promise<{ url: string; title: string; text: string; screenshot?: string }> {
  const root = (document.querySelector('main') || document.body).cloneNode(true) as HTMLElement;
  root.querySelectorAll('#gradient-panel-host,script,style,input,textarea,select,[contenteditable],iframe').forEach(el => el.remove());
  const links = Array.from(root.querySelectorAll('a[href]')).slice(0, 100).flatMap(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href') || '', window.location.href);
      return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) ? [`${(anchor.textContent || '').trim().slice(0, 150)}: ${url.href}`] : [];
    } catch { return []; }
  });
  const text = (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16000) + '\n\nVisible resource links:\n' + links.join('\n').slice(0, 8000);
  let screenshot: string | undefined;
  if (extensionAvailable()) {
    const host = document.getElementById('gradient-panel-host');
    const oldVisibility = host?.style.getPropertyValue('visibility') || '';
    const oldPriority = host?.style.getPropertyPriority('visibility') || '';
    try {
      host?.style.setProperty('visibility', 'hidden', 'important');
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const capture = await sendMessage({ type: 'GRADIENT_CAPTURE_CONTEXT' });
      screenshot = capture.screenshot;
    } finally {
      if (oldVisibility) host?.style.setProperty('visibility', oldVisibility, oldPriority);
      else host?.style.removeProperty('visibility');
    }
  }
  return { url: window.location.href, title: document.title, text, ...(screenshot ? { screenshot } : {}) };
}

export async function planBrowserAction(settings: AssistantSettings, input: BrowserPlanRequest): Promise<BrowserPlan> {
  return z.object({ summary: z.string(), actions: z.array(z.object({ kind: z.enum(['open', 'find', 'scroll', 'read']), description: z.string(), url: z.string().optional(), text: z.string().optional() })).max(12), warnings: z.array(z.string()) }).parse(await runJob(settings, 'browser', input));
}

export function safeBrowserUrl(value: string): string {
  const url = new URL(value, window.location.href);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('The model suggested an unsupported link.');
  let path = url.pathname;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(path); i++) path = decodeURIComponent(path);
  if (/\/(?:quizzes|assessments)\/.*(?:take|resume)|\/logout(?:\/|$)|\/(?:submissions|submit)(?:\/|$)/i.test(path)) throw new Error('This action is outside the study browser workspace.');
  return url.href;
}

/** Each action is invoked by an explicit UI click; model output cannot execute code. */
export async function applyBrowserAction(action: BrowserAction): Promise<void> {
  if (action.kind === 'open' && action.url) {
    const url = safeBrowserUrl(action.url);
    window.open(url, '_blank', 'noopener,noreferrer');
  } else if (action.kind === 'find' && action.text) {
    const found = (window as Window & { find?: (text: string) => boolean }).find?.(action.text.slice(0, 300));
    if (!found) throw new Error('That text is not visible on this page. Open the relevant resource and inspect it again.');
  } else if (action.kind === 'scroll') {
    window.scrollBy({ top: Math.round(window.innerHeight * .75), behavior: 'smooth' });
  } else if (action.kind === 'read') {
    if (action.url) window.open(safeBrowserUrl(action.url), '_blank', 'noopener,noreferrer');
    else if (action.text) {
      const found = (window as Window & { find?: (text: string) => boolean }).find?.(action.text.slice(0, 300));
      if (!found) throw new Error('The suggested text was not found on this page.');
    } else throw new Error('The model did not provide a section or link to read. Inspect the page again with a more specific goal.');
  } else throw new Error('This action needs a link or text target.');
}
