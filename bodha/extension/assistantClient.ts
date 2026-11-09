import { z } from 'zod';
import type { AssistantSettings, AssistantHealth, StudyRequest, StudyPacket, BrowserPlanRequest, BrowserPlan, BrowserAction, StudyProgress } from './assistantTypes.js';
import { assistantRequest, ExtensionReloadRequired, invalidatedExtension, validateBackendUrl } from './assistantTransport.js';
import { assignmentInstructionMaterials, materialIdentity, readCanvasMaterials } from './canvasMaterials.js';
import { getActiveAcademicContext, readAcademicMaterials } from './academicContext.js';
export type * from './assistantTypes.js';

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  backendUrl: 'http://127.0.0.1:8765', reasoningModel: 'qwen3:30b-a3b-thinking-2507-q8_0', visionModel: 'gemma4:e4b', detailLevel: 'a_bit_more', webResearch: true,
};
let cachedSettings:AssistantSettings|undefined;
let defaultsMigrated = false;
const SETTINGS_KEY = 'gradient_assistant_settings';
const settingsSchema = z.object({
  backendUrl: z.string().transform(validateBackendUrl), reasoningModel: z.string().min(1).max(200),
  visionModel: z.string().min(1).max(100), detailLevel: z.enum(['a_bit', 'a_bit_more', 'all_in']), webResearch: z.boolean(),
});
export const packetSchema = z.object({
  readingGuide: z.array(z.object({sourceId:z.string(),focus:z.string().max(1200),question:z.string().max(600),access:z.string().default("page text")})).max(8).default([]),
  finalLatex: z.string().max(400000).optional(),
  title: z.string().max(1000), summary: z.string().max(10000), markdown: z.string().max(200000), sampleMarkdown: z.string().max(200000),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string(), excerpt: z.string().optional(), kind: z.enum(['canvas', 'web']).optional() })).max(80),
  diagrams: z.array(z.object({ title: z.string(), nodes: z.array(z.object({ id: z.string(), label: z.string() })).max(20), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).max(40) })).max(10),
  graphs: z.array(z.object({ title: z.string(), xLabel: z.string().optional(), yLabel: z.string().optional(), points: z.array(z.object({ label: z.string(), value: z.number().finite() })).max(100) })).max(10),
  images: z.array(z.object({ title: z.string(), url: z.string(), alt: z.string(), sourceUrl: z.string() })).max(20),
  warnings: z.array(z.string()).max(100), checklist: z.array(z.string()).optional(), generatedAt: z.string().optional(),
  autopilot: z.boolean().optional(),
  brief: z.object({summary:z.string(),requirements:z.array(z.object({id:z.string(),text:z.string(),evidence:z.string()})).max(50),missingInformation:z.array(z.string())}).nullable().optional(),
  review: z.object({coverage:z.array(z.object({requirementId:z.string(),status:z.enum(['covered','partial','missing']),evidence:z.string(),notes:z.string()})).max(50),limitations:z.array(z.string())}).nullable().optional(),
  renderedVisuals: z.array(z.object({id:z.string(),title:z.string(),kind:z.enum(['function','data','diagram']),mimeType:z.literal('image/png'),data:z.string().max(4000000).regex(/^[A-Za-z0-9+/]+={0,2}$/),caption:z.string(),provenance:z.object({sourceId:z.string(),quote:z.string()}),verification:z.enum(['computed','source-data','conceptual'])})).max(4).optional(),
});

function extensionAvailable(): boolean { return typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function'; }

async function sendMessage(message: unknown): Promise<any> {
  let response;
  try { response = await chrome.runtime.sendMessage(message); }
  catch (error) { if (invalidatedExtension(error)) throw new ExtensionReloadRequired(); throw error; }
  if (!response?.ok) throw new Error(response?.error || 'The extension could not complete this operation. Reload the extension and Canvas tab.');
  return response.data;
}

async function request(settings: AssistantSettings, path: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const backendUrl = validateBackendUrl(settings.backendUrl);
  return assistantRequest(backendUrl, `/api/v1/assistant/${path}`, method, body);
}

export async function loadAssistantSettings(): Promise<AssistantSettings> {
  let saved: unknown=cachedSettings;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];}
    catch(error){if(!invalidatedExtension(error))throw error;}
  }
  else if (typeof localStorage !== 'undefined') {
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { saved = {}; }
  }
  const legacy = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {};
  const migrate = !defaultsMigrated && legacy.modelDefaultsVersion !== 2;
  if (migrate && ['gpt-oss:20b', 'qwen3:30b'].includes(String(legacy.reasoningModel))) saved = {...legacy, reasoningModel: DEFAULT_ASSISTANT_SETTINGS.reasoningModel};
  const parsed = settingsSchema.safeParse({ ...DEFAULT_ASSISTANT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) });
  cachedSettings=parsed.success ? parsed.data : { ...DEFAULT_ASSISTANT_SETTINGS };
  if (migrate) {
    const stored = {...cachedSettings, modelDefaultsVersion: 2};
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {await chrome.storage.local.set({[SETTINGS_KEY]:stored});} catch(error){if(!invalidatedExtension(error))throw error;}
    } else if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  }
  defaultsMigrated = true;
  return {...cachedSettings};
}

let settingsWrite: Promise<unknown> = Promise.resolve();
export function saveAssistantSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const write = settingsWrite.catch(() => {}).then(async () => {
    const next = settingsSchema.parse({ ...await loadAssistantSettings(), ...patch });
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {try{await chrome.storage.local.set({ [SETTINGS_KEY]: {...next, modelDefaultsVersion: 2} });}catch(error){if(!invalidatedExtension(error))throw error;}}
    else if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify({...next, modelDefaultsVersion: 2}));
    cachedSettings=next;
    return next;
  });
  settingsWrite = write;
  return write;
}

export async function getAssistantHealth(settings: AssistantSettings): Promise<AssistantHealth> {
  return z.object({
    studioVersion: z.number().optional(), ok: z.boolean(), ollamaConnected: z.boolean(), models: z.array(z.string()), message: z.string().optional(), pullStates: z.record(z.string()).optional(),
    modelDetails: z.array(z.object({ name: z.string(), size: z.number(), capabilities: z.array(z.string()), parameterSize: z.string().optional(), quantization: z.string().optional(), remote: z.boolean().optional() })).optional(),
    recommended: z.object({ reasoningModel: z.string(), visionModel: z.string(), reason: z.string().optional(), contextLength: z.number().optional() }).optional(),
  }).parse(await request(settings, 'health', 'GET'));
}

export async function pullAssistantModel(settings: AssistantSettings, model: string): Promise<void> {
  await request(settings, 'models/pull', 'POST', { model });
}

interface ReuSearchRequest { topics:string[]; model:string; candidates?:{title:string;url:string}[] }
/** Poll short requests so MV3's 30-second fetch limit never interrupts local inference. */
async function runJob(settings: AssistantSettings, type: 'generate' | 'browser' | 'research' | 'speech' | 'photo' | 'explain' | 'reu', input: StudyRequest | BrowserPlanRequest | {text:string;voice:string} | PhotoCheckRequest | ExplainRequest | ReuSearchRequest, onProgress?: (progress: StudyProgress) => void, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const job = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).parse(await request(settings, 'jobs', 'POST', { type, request: input }));
  signal?.throwIfAborted();
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    signal?.throwIfAborted();
    const state = await request(settings, `jobs/${job.id}`, 'GET');
    signal?.throwIfAborted();
    if (typeof state.stage === 'string' && typeof state.label === 'string') onProgress?.({stage:state.stage,label:state.label});
    if (state.status === 'complete') return state.result;
    if (state.status === 'error') throw new Error(state.error || 'Local model generation failed.');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Generation exceeded 15 minutes. Try a smaller installed model or a lower detail level.');
}

export interface ExplainRequest { model: string; topic: 'overview' | 'course'; facts: Record<string, string | number> }

export function searchReuOpportunities(settings:AssistantSettings,input:Omit<ReuSearchRequest,'model'>,onProgress?:(progress:StudyProgress)=>void,signal?:AbortSignal):Promise<unknown> {
  return runJob(settings,'reu',{...input,model:settings.reasoningModel},onProgress,signal);
}

/** The local model only rewords figures computed from Canvas; the backend rejects any new numbers. */
export async function explainPlainly(settings: AssistantSettings, topic: ExplainRequest['topic'], facts: ExplainRequest['facts'], signal?: AbortSignal): Promise<string> {
  const result = await runJob(settings, 'explain', { model: settings.reasoningModel, topic, facts }, undefined, signal);
  const text = z.object({ explanation: z.string().min(1).max(900) }).parse(result).explanation;
  return text.replace(/[\u00a0\u202f]/g, ' ').replace(/(\d) %/g, '$1%').trim();
}

export async function enableBrowserSearch(): Promise<boolean> {
  if (!extensionAvailable()) throw new Error('Browser Google search requires the installed Chrome extension.');
  return (await sendMessage({type:'OFFCANVAS_ENABLE_SEARCH'})).granted;
}

export async function generateStudyPacket(settings: AssistantSettings, input: StudyRequest, onProgress?: (progress: StudyProgress) => void, signal?: AbortSignal): Promise<StudyPacket> {
  signal?.throwIfAborted();
  const origin = typeof window !== 'undefined' ? window.location.origin : new URL(input.assignment.url).origin;
  onProgress?.({stage:'reading',label:'Reading the assignment and accessible course documents'});
  const context = getActiveAcademicContext();
  const extract = (file: {title:string;mimeType:string;data:string}) => request(settings, 'materials/extract', 'POST', file);
  const contextAssignment = context?.snapshot.origin === origin
    ? context.courses.find(course => course.id === input.course.id)?.assignments.find(item => item.id === input.assignment.id) : undefined;
  // Automatic resume starts before the workspace finishes loading. Carry the
  // just-read assignment HTML explicitly; attachment checks cannot depend on UI state.
  const html = input.assignment.descriptionHtml ?? contextAssignment?.descriptionHtml ?? '';
  const required = input.studio ? [] : assignmentInstructionMaterials(html, origin, input.course.id);
  const selected = new Map<string, StudyRequest['resources'][number]>();
  for (const resource of [...required, ...input.resources]) {
    const key = materialIdentity(resource.url);
    if (!selected.has(key)) selected.set(key, resource);
  }
  const resources = [...selected.values()];
  const localResources = resources.filter(resource => new URL(resource.url, origin).origin === origin);
  const canUseContext = context && context.snapshot.origin === origin && !input.studio &&
    (!input.assignment.descriptionHtml || contextAssignment?.descriptionHtml === html);
  const materials = canUseContext
    ? await readAcademicMaterials(context, input.course.id, localResources, extract, signal)
    : await readCanvasMaterials(localResources, origin, input.course.id, extract, signal);
  const sourceFiles = required.filter(resource => new URL(resource.url).origin !== origin);
  if (sourceFiles.length) {
    onProgress?.({stage:'reading',label:'Reading the original assignment attachments through your signed-in Canvas session'});
    if (extensionAvailable()) {
      try {
        const loaded = z.object({resources:z.array(z.object({title:z.string(),url:z.string(),text:z.string().optional()})).max(12),warnings:z.array(z.string())})
          .parse(await sendMessage({type:'OFFCANVAS_READ_SOURCE_MATERIALS',backendUrl:settings.backendUrl,resources:sourceFiles}));
        const requested = new Set(sourceFiles.map(resource => materialIdentity(resource.url)));
        materials.resources.push(...loaded.resources.filter(resource => requested.has(materialIdentity(resource.url))));
        materials.warnings.push(...loaded.warnings);
      } catch (error) { if (invalidatedExtension(error)) throw error; materials.warnings.push(error instanceof Error ? error.message : 'Could not read the original Canvas attachment.'); }
    } else materials.warnings.push('Reading original Canvas attachments requires the installed extension and a signed-in source Canvas session.');
  }
  signal?.throwIfAborted();
  if (input.autopilot) {
    const unread = required.filter(link => !materials.resources.some(resource => materialIdentity(resource.url) === materialIdentity(link.url) && resource.text?.trim()));
    if (unread.length) throw new Error(`Could not read the linked assignment instructions: ${unread.map(item => item.title).join(', ')}. ${materials.warnings.join(' ')} Sign in to the original Canvas course and retry, or restage the course with its readable instructions. No reference draft was generated.`);
  }
  // Raw HTML is browser-only discovery metadata; send readable text to the backend.
  const {descriptionHtml: _html, ...assignment} = input.assignment;
  const priority = new Map(required.map((resource, index) => [materialIdentity(resource.url), index]));
  const orderedMaterials = [...materials.resources].sort((a, b) =>
    (priority.get(materialIdentity(a.url)) ?? required.length) - (priority.get(materialIdentity(b.url)) ?? required.length));
  const enriched = {...input, assignment, resources: orderedMaterials};
  let webSources: {title:string;url:string;snippet:string}[] = [];
  const searchWarnings:string[] = [];
  if (input.webResearch && extensionAvailable()) {
    let query:string|null = `${input.assignment.title} tutorial explanation`.slice(0,250);
    const genericWords = new Set('homework assignment assignments problems problem exercise exercises worksheet chapter module weekly project final draft submission questions unit exam quiz test task practice report lab essay paper fall spring summer autumn semester'.split(' '));
    const meaningful = (input.assignment.title.toLowerCase().match(/[a-z]{4,}/g) || []).some(word=>!genericWords.has(word));
    if (!meaningful) {
      onProgress?.({stage:'parsing',label:'Inferring a public research topic locally from the homework instructions'});
      try {
        const plan = z.object({query:z.string().max(250).nullable(),warning:z.string().nullable()}).parse(await runJob(settings,'research',enriched,onProgress,signal));
        query=plan.query;
        if (plan.warning) searchWarnings.push(plan.warning);
      } catch (error) {query=null; searchWarnings.push(error instanceof Error?error.message:'Could not infer a reliable research topic.');}
    }
    if (query) {
      onProgress?.({stage:'researching',label:'Reading Google search results in your browser'});
      try { webSources = await sendMessage({type:'OFFCANVAS_BROWSER_SEARCH',query,limit:input.level==='all_in'?8:input.level==='a_bit_more'?5:3}); }
      catch(error) { if (invalidatedExtension(error)) throw error; searchWarnings.push(error instanceof Error?error.message:'Browser search was unavailable.'); }
    }
  }
  signal?.throwIfAborted();
  onProgress?.({stage:'queued',label:'Sending the brief to your local model'});
  const packet = packetSchema.parse(await runJob(settings, 'generate', { ...enriched, webSources }, onProgress, signal));
  packet.sources = packet.sources.map(source => ({ ...source, documentText: materials.resources.find(resource => resource.url === source.url)?.text ?? (source.id === 'S1' ? input.assignment.description : undefined) }));
  packet.warnings = [...searchWarnings, ...materials.warnings, ...packet.warnings];
  return packet;
}

export async function captureBrowserContext(includeScreenshot = true): Promise<{ url: string; title: string; text: string; screenshot?: string }> {
  const root = (document.querySelector('main') || document.body).cloneNode(true) as HTMLElement;
  root.querySelectorAll('#offcanvas-panel-host,script,style,input,textarea,select,[contenteditable],iframe').forEach(el => el.remove());
  const links = Array.from(document.querySelectorAll('a[href]')).filter(a=>!a.closest('#offcanvas-panel-host,#offcanvas-page-control')).slice(0, 160).flatMap(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href') || '', window.location.href);
      return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) ? [`${(anchor.textContent || '').trim().slice(0, 150)}: ${url.href}`] : [];
    } catch { return []; }
  });
  const text = (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16000) + '\n\nVisible resource links:\n' + links.join('\n').slice(0, 8000);
  let screenshot: string | undefined;
  if (includeScreenshot && extensionAvailable()) {
    const host = document.getElementById('offcanvas-panel-host');
    const oldVisibility = host?.style.getPropertyValue('visibility') || '';
    const oldPriority = host?.style.getPropertyPriority('visibility') || '';
    try {
      host?.style.setProperty('visibility', 'hidden', 'important');
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const capture = await sendMessage({ type: 'OFFCANVAS_CAPTURE_CONTEXT' });
      screenshot = capture.screenshot;
    } catch(error) {
      if(!invalidatedExtension(error))throw error;
    } finally {
      if (oldVisibility) host?.style.setProperty('visibility', oldVisibility, oldPriority);
      else host?.style.removeProperty('visibility');
    }
  }
  return { url: window.location.href, title: document.title, text, ...(screenshot ? { screenshot } : {}) };
}

export async function planBrowserAction(settings: AssistantSettings, input: BrowserPlanRequest, signal?: AbortSignal): Promise<BrowserPlan> {
  return z.object({ summary: z.string(), actions: z.array(z.object({ kind: z.enum(['open', 'find', 'scroll', 'read']), description: z.string(), url: z.string().nullish().transform(value => value ?? undefined), text: z.string().nullish().transform(value => value ?? undefined) })).max(12), warnings: z.array(z.string()) }).parse(await runJob(settings, 'browser', input, undefined, signal));
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

export async function renderAssignmentPdf(settings:AssistantSettings,html:string):Promise<string>{
 return z.object({data:z.string().regex(/^[A-Za-z0-9+/]+=*$/)}).parse(await request(settings,'export/pdf','POST',{html})).data;
}

export async function generateSpeech(text: string, voice: string, signal?: AbortSignal): Promise<{data:string;mimeType:string;duration:number}> {
  const settings = await loadAssistantSettings();
  return z.object({data:z.string().max(30000000).regex(/^[A-Za-z0-9+/]+=*$/),mimeType:z.literal('audio/wav'),duration:z.number().positive()}).parse(await runJob(settings, 'speech', {text,voice}, undefined, signal));
}

export interface PhotoCheckRequest { phase:'read'|'critique';image?:string;model:string;title:string;instructions:string;transcription?:string;rubric?:unknown[];homeworkConfirmed:boolean }
export async function checkHomeworkPhoto(input: PhotoCheckRequest, signal?: AbortSignal) {
  return z.object({transcription:z.string(),uncertainties:z.array(z.string()),warnings:z.array(z.string()),critique:z.object({feedbackSummary:z.string(),rewriteCheckPassed:z.boolean(),criteria:z.array(z.object({criterionDescription:z.string(),readinessLevel:z.string(),evidenceQuotes:z.array(z.string()),whatWouldRaiseIt:z.string()}))}).nullable()}).parse(await runJob(await loadAssistantSettings(),'photo',input,undefined,signal));
}
