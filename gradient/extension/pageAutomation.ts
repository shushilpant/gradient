import { z } from 'zod';
import type { StudyPacket } from './assistantTypes.js';
import type { ComputerSession, ComputerStep } from './computerTypes.js';
import { courseworkDestination } from './pageNavigation.js';
import { shouldRunOnPage } from './safetyGuard.js';

const STORAGE_KEY = 'gradient_tab_automation_v1';
const MAX_RUN_AGE = 20 * 60 * 1000;
const LOCAL_CANVAS = /^http:\/\/(127\.0\.0\.1|localhost):8080$/;
const stepSchema = z.object({
  number: z.number().int().positive(),
  action: z.enum(['observe', 'open', 'scroll', 'read', 'generate']),
  url: z.string().max(2000),
  reason: z.string().max(1000),
});
const storedRunSchema = z.object({
  kind: z.enum(['workflow', 'demo']),
  data: z.unknown(),
  origin: z.string().regex(LOCAL_CANVAS),
  userId: z.string().max(100).optional(),
  expectedPath: z.string().max(2000),
  startedAt: z.number(),
  cursor: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  session: z.object({
    id: z.string().uuid(),
    demo: z.boolean(),
    status: z.literal('running'),
    stage: z.string().max(100),
    label: z.string().max(1000),
    steps: z.array(stepSchema).max(32),
  }),
});

export interface PageAutomationRun<T = unknown> {
  kind: 'workflow' | 'demo';
  data: T;
  origin: string;
  userId?: string;
  expectedPath: string;
  startedAt: number;
  cursor?: { x: number; y: number };
  session: ComputerSession;
}

let active: { run: PageAutomationRun; controller: AbortController } | null = null;
let latest: ComputerSession | null = null;
let hiddenPanel: { host: HTMLElement; display: string; priority: string } | null = null;
const listeners = new Set<(session: ComputerSession | null) => void>();

export function canAutomateCurrentPage(): boolean {
  return typeof window !== 'undefined' && window.top === window.self &&
    LOCAL_CANVAS.test(window.location.origin) && shouldRunOnPage(window.location.href, document);
}

function storedRun(): PageAutomationRun | null {
  if (typeof window === 'undefined' || !LOCAL_CANVAS.test(window.location.origin)) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 130_000) return null;
    const parsed = storedRunSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.origin === location.origin && Date.now() - parsed.data.startedAt < MAX_RUN_AGE) {
      return parsed.data as PageAutomationRun;
    }
  } catch { /* No pending run in this tab. */ }
  return null;
}

export function getPageAutomation(): ComputerSession | null {
  return latest ?? storedRun()?.session ?? null;
}

export function subscribePageAutomation(listener: (session: ComputerSession | null) => void): () => void {
  listeners.add(listener);
  listener(getPageAutomation());
  return () => listeners.delete(listener);
}

function hidePanel() {
  const host = document.getElementById('gradient-panel-host');
  if (host && hiddenPanel?.host !== host) {
    hiddenPanel = { host, display: host.style.getPropertyValue('display'), priority: host.style.getPropertyPriority('display') };
    host.style.setProperty('display', 'none', 'important');
  }
}

function restorePanel() {
  if (!hiddenPanel) return;
  const { host, display, priority } = hiddenPanel;
  if (display) host.style.setProperty('display', display, priority);
  else host.style.removeProperty('display');
  hiddenPanel = null;
}

function clearCursor() {
  document.getElementById('gradient-automation-cursor')?.remove();
}

function showControls(session: ComputerSession) {
  let host = document.getElementById('gradient-page-control');
  if (!canAutomateCurrentPage()) {
    host?.remove();
    restorePanel();
    clearCursor();
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.id = 'gradient-page-control';
    host.style.cssText = 'all:initial;position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483647;width:max-content;max-width:calc(100vw - 36px)';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = '.control{display:flex;align-items:center;gap:14px;padding:9px 10px 9px 18px;background:#873b22;color:#ffffff;box-shadow:0 10px 30px #873b224d;border-radius:22px;font:600 14px/1.4 system-ui}.label{min-width:0;overflow-wrap:anywhere}button{cursor:pointer;flex:none;border:0;border-radius:14px;padding:8px 13px;background:#f8ede6;color:#873b22;font:700 13px system-ui}';
    const control = document.createElement('div');
    control.className = 'control';
    const label = document.createElement('span');
    label.className = 'label';
    label.setAttribute('role', 'status');
    control.append(label, document.createElement('button'));
    root.append(style, control);
    document.body.append(host);
  }

  const running = session.status === 'running';
  if (running) {
    hidePanel();
    if (!document.getElementById('gradient-automation-cursor')) drawCursor();
  }
  else {
    restorePanel();
    clearCursor();
  }
  const label = host.shadowRoot?.querySelector('.label');
  const button = host.shadowRoot?.querySelector('button');
  if (label) label.textContent = session.label;
  if (button) {
    button.textContent = running ? 'Stop run' : session.packet ? 'Show result' : 'Dismiss';
    button.onclick = () => {
      if (running) {
        stopPageAutomation();
      } else {
        host.remove();
        window.dispatchEvent(new Event('gradient:show-automation'));
      }
    };
  }
}

function publish(session: ComputerSession) {
  latest = { ...session, steps: [...session.steps] };
  showControls(latest);
  for (const listener of listeners) listener(latest);
}

function save(run: PageAutomationRun) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
}

function clearStoredRun() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage is unavailable. */ }
}

function samePage(run: PageAutomationRun): boolean {
  return run.origin === location.origin && run.expectedPath === location.pathname && canAutomateCurrentPage();
}

function verifyActive(run: PageAutomationRun, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (active?.run !== run || run.session.status !== 'running') throw new DOMException('Automation stopped.', 'AbortError');
  if (!samePage(run)) throw new Error('Automation stopped because the Canvas page changed.');
}

async function verifyAccount(run: PageAutomationRun, signal: AbortSignal): Promise<void> {
  if (!run.userId) return;
  const response = await fetch(new URL('/api/v1/users/self/profile', run.origin), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(7500)]),
  });
  if (!response.ok) throw new Error('Canvas could not verify the signed-in account.');
  // Older Canvas installations prefix session-authenticated JSON.
  const body = (await response.text()).replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, '');
  const profile: { id?: string | number } | null = JSON.parse(body);
  if (String(profile?.id) !== run.userId) throw new Error('The signed-in Canvas account changed.');
}

export function beginPageAutomation<T>(kind: PageAutomationRun['kind'], data: T, label: string, userId?: string): PageAutomationRun<T> {
  if (!LOCAL_CANVAS.test(location.origin)) throw new Error('Open a coursework page in the local Canvas tab on port 8080.');
  if (!canAutomateCurrentPage()) throw new Error('Automation is unavailable on this assessment or unsupported Canvas page.');
  if (storedRun() || active) throw new Error('An automation run is already active in this Canvas tab.');
  const run: PageAutomationRun<T> = {
    kind, data, userId,
    origin: location.origin, expectedPath: location.pathname, startedAt: Date.now(),
    session: { id: crypto.randomUUID(), demo: kind === 'demo', status: 'running', stage: 'starting', label, steps: [] },
  };
  save(run);
  publish(run.session);
  return run;
}

export function updatePageAutomation(run: PageAutomationRun, stage: string, label: string, step?: Omit<ComputerStep, 'number'>): void {
  verifyActive(run);
  run.session.stage = stage.slice(0, 100);
  run.session.label = label.slice(0, 1000);
  if (step) {
    run.session.steps.push({ ...step, reason: step.reason.slice(0, 1000), number: (run.session.steps.at(-1)?.number ?? 0) + 1 });
    if (run.session.steps.length > 32) run.session.steps.shift();
  }
  save(run);
  publish(run.session);
}

export function finishPageAutomation(run: PageAutomationRun, packet: StudyPacket, label: string): void {
  verifyActive(run);
  run.session = { ...run.session, status: 'complete', stage: 'complete', label, packet };
  clearStoredRun();
  publish(run.session);
}

export function stopPageAutomation(): void {
  const run = active?.run ?? storedRun();
  clearStoredRun();
  if (!run) {
    restorePanel();
    clearCursor();
    if (latest?.status === 'running') {
      latest = null;
      document.getElementById('gradient-page-control')?.remove();
      for (const listener of listeners) listener(null);
    }
    return;
  }
  active?.controller.abort();
  active = null;
  publish({ ...run.session, status: 'cancelled', stage: 'cancelled', label: 'Automation stopped.' });
}

export async function resumePageAutomation<T>(
  kind: PageAutomationRun['kind'],
  runner: (run: PageAutomationRun<T>, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const saved = storedRun();
  if (!saved || saved.kind !== kind || active) return;
  if (!samePage(saved)) {
    stopPageAutomation();
    return;
  }
  const controller = new AbortController();
  const run = saved as PageAutomationRun<T>;
  active = { run, controller };
  const suspend = () => {
    controller.abort();
    restorePanel();
    clearCursor();
    document.getElementById('gradient-page-control')?.remove();
    latest = null;
    for (const listener of listeners) listener(null);
  };
  window.addEventListener('pagehide', suspend, { once: true });
  try {
    publish(run.session);
    await verifyAccount(run, controller.signal);
    verifyActive(run, controller.signal);
    await runner(run, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted && active?.run === run) {
      const message = error instanceof Error ? error.message : 'The Canvas automation could not finish.';
      clearStoredRun();
      publish({ ...run.session, status: 'error', stage: 'error', label: message, error: message });
    }
  } finally {
    window.removeEventListener('pagehide', suspend);
    if (active?.run === run) active = null;
  }
}

export async function waitPageAutomation(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function drawCursor(target?: HTMLElement, clicking = false) {
  const bounds = target?.getBoundingClientRect();
  let marker = document.getElementById('gradient-automation-cursor');
  const run = active?.run ?? storedRun();
  const previous = run?.cursor;
  const x = Math.max(1, Math.min(innerWidth - 20, bounds
    ? bounds.left + Math.min(bounds.width / 2, 22)
    : previous?.x ?? innerWidth / 2));
  const y = Math.max(1, Math.min(innerHeight - 24, bounds
    ? bounds.top + bounds.height / 2
    : previous?.y ?? innerHeight / 2));
  if (!marker) {
    marker = document.createElement('div');
    marker.id = 'gradient-automation-cursor';
    marker.setAttribute('aria-hidden', 'true');
    // Isolate the indicator from Canvas's SVG and icon styles. This overlay
    // never handles input or changes the user's native mouse cursor.
    marker.style.cssText = 'all:initial;display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;z-index:2147483647!important;width:19px!important;height:23px!important;pointer-events:none!important;';
    const root = marker.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      svg{all:initial;display:block;width:19px;height:23px;overflow:visible;filter:drop-shadow(0 1px 1px #0005)}
      .pulse{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border:1.5px solid #a64b2a;border-radius:50%;box-sizing:border-box;opacity:0;pointer-events:none}
    </style><span class="pulse"></span><svg viewBox="0 0 19 23" aria-hidden="true"><path d="M1 1V18L5.5 14L9 21.5L12 20L8.5 12.5H15Z" fill="#a64b2a" stroke="#FFFFFF" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
    document.body.append(marker);
  }
  const oldX = Number.parseFloat(marker.style.left);
  const oldY = Number.parseFloat(marker.style.top);
  marker.style.setProperty('left', `${x}px`, 'important');
  marker.style.setProperty('top', `${y}px`, 'important');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion && Number.isFinite(oldX) && Number.isFinite(oldY) && (oldX !== x || oldY !== y)) {
    marker.animate([
      { transform: `translate(${oldX - x}px,${oldY - y}px)` },
      { transform: 'translate(0,0)' },
    ], { duration: 300, easing: 'ease-in-out' });
  }
  if (clicking) marker.shadowRoot?.querySelector('.pulse')?.animate([
    { opacity: .75, transform: 'scale(.5)' },
    { opacity: 0, transform: 'scale(1.5)' },
  ], { duration: reducedMotion ? 1 : 420, easing: 'ease-out' });
  if (run) {
    run.cursor = { x, y };
    save(run);
  }
}

export async function navigatePageAutomation(run: PageAutomationRun, url: string, signal: AbortSignal): Promise<void> {
  verifyActive(run, signal);
  const destination = new URL(url, location.href);
  const validUrl = courseworkDestination(destination.href, location.href, [destination.href]);
  if (!validUrl || !shouldRunOnPage(validUrl)) throw new Error('The destination is outside supported Canvas coursework.');
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .find(anchor => !anchor.closest('#gradient-panel-host,#gradient-page-control') &&
      anchor.getClientRects().length > 0 && anchor.origin === destination.origin &&
      anchor.pathname.replace(/\/$/, '') === destination.pathname.replace(/\/$/, ''));
  link?.scrollIntoView({ block: 'center', inline: 'nearest' });
  drawCursor(link, true);
  await waitPageAutomation(450, signal);
  verifyActive(run, signal);
  run.expectedPath = destination.pathname;
  save(run);
  try {
    location.assign(validUrl);
  } catch (error) {
    run.expectedPath = location.pathname;
    throw error;
  }
  // Keep the driver active until navigation unloads this document.
  await waitPageAutomation(15_000, signal);
  throw new Error('Canvas did not open the next page. Try the automation again.');
}

export function scrollPageAutomation(run: PageAutomationRun, signal: AbortSignal): void {
  verifyActive(run, signal);
  drawCursor();
  window.scrollBy({ top: Math.round(innerHeight * .7), behavior: 'smooth' });
}
