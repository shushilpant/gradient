import type { CanvasSnapshot } from './liveCanvas.js';

export interface TrackedDeadline {
  id: string;
  origin: string;
  userId: string;
  courseId: string;
  assignmentId: string;
  title: string;
  courseName: string;
  courseCode: string;
  dueAt: string;
  url: string;
}
export interface DeadlineTrackingState {
  enabled: boolean;
  excludedIds: string[];
  deadlines: TrackedDeadline[];
  updatedAt: string;
}
interface TrackingStore {
  accounts: Record<string, DeadlineTrackingState>;
  delivered: Record<string, number>;
  /** Last successfully synced student per Canvas origin; preferences for other students remain saved. */
  activeAccounts: Record<string, string>;
}
export interface DeadlineReminder {
  name: string;
  when: number;
  leadHours: 24 | 1;
  deadline: TrackedDeadline;
}

const STORAGE_KEY = 'gradient_deadline_tracking_v1';
const ALARM_PREFIX = 'gradient-deadline:';
const HOUR = 60 * 60 * 1000;
const emptyStore = (): TrackingStore => ({ accounts: {}, delivered: {}, activeAccounts: {} });
const emptyState = (): DeadlineTrackingState => ({ enabled: false, excludedIds: [], deadlines: [], updatedAt: '' });
const scope = (origin: string, userId: string) => `${origin}|${userId}`;
const extensionAvailable = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id;

/** Only outstanding assignments with valid deadlines are eligible. IDs survive due-date changes. */
export function getSnapshotDeadlines(snapshot: CanvasSnapshot): TrackedDeadline[] {
  const deadlines: TrackedDeadline[] = [];
  for (const course of snapshot.courses) for (const assignment of course.assignments) {
    if (!assignment.dueAt || !Number.isFinite(Date.parse(assignment.dueAt))) continue;
    if (assignment.submission?.excused || assignment.submission?.score != null ||
      ['submitted', 'pending_review', 'graded'].includes(assignment.submission?.workflowState ?? '')) continue;
    deadlines.push({
      id: `${scope(snapshot.origin, snapshot.user.id)}|${course.id}|${assignment.id}`,
      origin: snapshot.origin, userId: snapshot.user.id, courseId: course.id, assignmentId: assignment.id,
      title: assignment.name, courseName: course.name, courseCode: course.code,
      dueAt: new Date(assignment.dueAt).toISOString(),
      url: `${snapshot.origin}/courses/${encodeURIComponent(course.id)}/assignments/${encodeURIComponent(assignment.id)}`,
    });
  }
  return [...new Map(deadlines.map(deadline => [deadline.id, deadline])).values()]
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

function reminderName(deadline: TrackedDeadline, leadHours: 24 | 1): string {
  return `${ALARM_PREFIX}${encodeURIComponent(deadline.id)}:${Date.parse(deadline.dueAt)}:${leadHours}`;
}

/** Build a deterministic, deduplicated plan; never backfill reminders that already passed. */
export function planDeadlineReminders(state: DeadlineTrackingState, now = Date.now()): DeadlineReminder[] {
  if (!state.enabled) return [];
  const excluded = new Set(state.excludedIds);
  const reminders = new Map<string, DeadlineReminder>();
  for (const deadline of state.deadlines) {
    if (excluded.has(deadline.id)) continue;
    const due = Date.parse(deadline.dueAt);
    if (!Number.isFinite(due)) continue;
    for (const leadHours of [24, 1] as const) {
      const when = due - leadHours * HOUR;
      if (when > now) {
        const name = reminderName(deadline, leadHours);
        reminders.set(name, { name, when, leadHours, deadline });
      }
    }
  }
  return [...reminders.values()].sort((a, b) => a.when - b.when);
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function icsDate(date: Date): string { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function foldIcsLine(line: string): string {
  let result = '', octets = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (octets + size > 75) { result += '\r\n '; octets = 1; }
    result += char; octets += size;
  }
  return result;
}

/** A portable calendar with stable event UIDs and two native calendar reminders. */
export function createDeadlineCalendar(deadlines: TrackedDeadline[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OffCanvas//Assignment Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const deadline of new Map(deadlines.map(d => [d.id, d])).values()) {
    const due = new Date(deadline.dueAt);
    if (!Number.isFinite(due.getTime())) continue;
    const hostname = new URL(deadline.origin).hostname;
    lines.push('BEGIN:VEVENT', `UID:bodha-${encodeURIComponent(deadline.userId)}-${encodeURIComponent(deadline.courseId)}-${encodeURIComponent(deadline.assignmentId)}@${hostname}`,
      `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(due)}`, `DTEND:${icsDate(new Date(due.getTime() + 15 * 60000))}`,
      `SUMMARY:${escapeIcs(`${deadline.courseCode}: ${deadline.title}`)}`,
      `DESCRIPTION:${escapeIcs(`${deadline.courseName}\nAssignment deadline from Canvas.\n${deadline.url}`)}`,
      `URL:${escapeIcs(deadline.url)}`);
    for (const hours of [24, 1]) lines.push('BEGIN:VALARM', `TRIGGER:-PT${hours}H`, 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(`${deadline.title} is due in ${hours} hour${hours === 1 ? '' : 's'}.`)}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR'].map(foldIcsLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(deadline: TrackedDeadline): string {
  const due = new Date(deadline.dueAt);
  if (!Number.isFinite(due.getTime())) throw new Error('This deadline has no valid date.');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', `${deadline.courseCode}: ${deadline.title}`);
  url.searchParams.set('dates', `${icsDate(due)}/${icsDate(new Date(due.getTime() + 15 * 60000))}`);
  url.searchParams.set('details', `${deadline.courseName}\nAssignment deadline from Canvas.\n${deadline.url}`);
  return url.href;
}

export function downloadDeadlineCalendar(deadlines: TrackedDeadline[]): void {
  const url = URL.createObjectURL(new Blob([createDeadlineCalendar(deadlines)], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'offcanvas-canvas-deadlines.ics'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readStore(): Promise<TrackingStore> {
  let stored: unknown;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  else if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) try { stored = JSON.parse(raw); } catch { /* An old or corrupt preference starts fresh. */ }
  }
  if (!stored || typeof stored !== 'object') return emptyStore();
  const value = stored as Partial<TrackingStore>;
  return { accounts: value.accounts && typeof value.accounts === 'object' ? value.accounts : {}, delivered: value.delivered && typeof value.delivered === 'object' ? value.delivered : {},
    // Legacy data has no reliable current identity. Keep its configuration, but wait for a validated sync before scheduling.
    activeAccounts: value.activeAccounts && typeof value.activeAccounts === 'object' ? value.activeAccounts : {} };
}
async function writeStore(store: TrackingStore): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [STORAGE_KEY]: store });
  else if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

async function sendTrackingMessage(message: Record<string, unknown>): Promise<DeadlineTrackingState> {
  const response = await chrome.runtime.sendMessage(message) as { ok: boolean; state?: DeadlineTrackingState; error?: string };
  if (!response?.ok || !response.state) throw new Error(response?.error || 'The extension could not update your reminders. Reload your Canvas tab and try again.');
  return response.state;
}
export async function getDeadlineTracking(snapshot: CanvasSnapshot): Promise<DeadlineTrackingState> {
  if (extensionAvailable()) return sendTrackingMessage({ type: 'OFFCANVAS_GET_TRACKING', origin: snapshot.origin, userId: snapshot.user.id });
  return (await readStore()).accounts[scope(snapshot.origin, snapshot.user.id)] ?? emptyState();
}

/** Changes are scheduled in the service worker, so reminders do not rely on an open Canvas tab. */
export async function setDeadlineTracking(snapshot: CanvasSnapshot, enabled: boolean, excludedIds?: string[]): Promise<DeadlineTrackingState> {
  const message = { type: 'OFFCANVAS_TRACK_DEADLINES', origin: snapshot.origin, userId: snapshot.user.id, enabled, deadlines: getSnapshotDeadlines(snapshot), ...(excludedIds ? { excludedIds } : {}) };
  if (extensionAvailable()) return sendTrackingMessage(message);
  const store = await readStore();
  const key = scope(snapshot.origin, snapshot.user.id);
  const previous = store.accounts[key] ?? emptyState();
  const state = { ...previous, enabled, deadlines: message.deadlines, excludedIds: excludedIds ?? previous.excludedIds, updatedAt: new Date().toISOString() };
  store.accounts[key] = state; store.activeAccounts[snapshot.origin] = snapshot.user.id; await writeStore(store);
  return state;
}

/** Call after successful Canvas sync. Submitted, removed, and rescheduled assignments replace the old plan. */
export async function syncTrackedDeadlines(snapshot: CanvasSnapshot): Promise<void> {
  if (!extensionAvailable()) return;
  await sendTrackingMessage({ type: 'OFFCANVAS_SYNC_DEADLINES', origin: snapshot.origin, userId: snapshot.user.id, deadlines: getSnapshotDeadlines(snapshot) });
}

export function isDeadlineMessage(message: unknown): boolean {
  return !!message && typeof message === 'object' && ['OFFCANVAS_GET_TRACKING', 'OFFCANVAS_TRACK_DEADLINES', 'OFFCANVAS_SYNC_DEADLINES'].includes(String((message as { type?: unknown }).type));
}

/** Serialize background writes so simultaneous tab refreshes cannot overwrite delivered reminders. */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const pending = queue.then(task, task);
  queue = pending.catch(() => {});
  return pending;
}
function validateMessage(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): { origin: string; userId: string } {
  if (typeof message.origin !== 'string' || typeof message.userId !== 'string' || !/^[\w-]{1,100}$/.test(message.userId)) throw new Error('Invalid Canvas reminder account.');
  const origin = new URL(message.origin).origin;
  if (origin !== message.origin || !sender.tab?.url || new URL(sender.tab.url).origin !== origin) throw new Error('Deadline reminders must come from your signed-in Canvas tab.');
  return { origin, userId: message.userId };
}
function validateDeadlines(raw: unknown, origin: string, userId: string): TrackedDeadline[] {
  if (!Array.isArray(raw) || raw.length > 5000) throw new Error('Canvas returned too many deadlines to track.');
  const result = new Map<string, TrackedDeadline>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') throw new Error('Invalid assignment deadline.');
    const deadline = value as TrackedDeadline;
    if (['id', 'origin', 'userId', 'courseId', 'assignmentId', 'title', 'courseName', 'courseCode', 'dueAt', 'url'].some(key => typeof (value as Record<string, unknown>)[key] !== 'string')) throw new Error('Invalid assignment deadline.');
    if (deadline.origin !== origin || deadline.userId !== userId || deadline.id !== `${scope(origin, userId)}|${deadline.courseId}|${deadline.assignmentId}` || !Number.isFinite(Date.parse(deadline.dueAt))) throw new Error('Invalid assignment deadline.');
    const url = new URL(deadline.url);
    if (url.origin !== origin || url.pathname !== `/courses/${encodeURIComponent(deadline.courseId)}/assignments/${encodeURIComponent(deadline.assignmentId)}`) throw new Error('Deadline links must point to the current Canvas account.');
    result.set(deadline.id, { ...deadline, title: deadline.title.slice(0, 1000), courseName: deadline.courseName.slice(0, 1000), courseCode: deadline.courseCode.slice(0, 200), dueAt: new Date(deadline.dueAt).toISOString() });
  }
  return [...result.values()];
}

/** Background-only: reconcile alarms by name, removing obsolete due dates and disabled selections. */
export async function scheduleDeadlineReminders(states?: DeadlineTrackingState[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  const store = await readStore();
  const trackingStates = states ?? Object.values(store.accounts);
  const active = (deadline: TrackedDeadline) => store.activeAccounts[deadline.origin] === deadline.userId;
  const planned = trackingStates.flatMap(state => planDeadlineReminders(state)).filter(item => active(item.deadline));
  const desired = new Map(planned.filter(item => !store.delivered[item.name]).map(item => [item.name, item]));
  const existing = await chrome.alarms.getAll();
  for (const alarm of existing) if (alarm.name.startsWith(ALARM_PREFIX) && !desired.has(alarm.name)) await chrome.alarms.clear(alarm.name);
  const names = new Set(existing.map(alarm => alarm.name));
  for (const reminder of desired.values()) if (!names.has(reminder.name)) await chrome.alarms.create(reminder.name, { when: reminder.when });
  // Remove already-visible alerts when their student is no longer active, or tracking is paused.
  const visible = new Set(trackingStates.flatMap(state => state.enabled ? state.deadlines.filter(deadline => active(deadline) && !state.excludedIds.includes(deadline.id) && Date.parse(deadline.dueAt) > Date.now())
    .flatMap(deadline => [reminderName(deadline, 24), reminderName(deadline, 1)]) : []));
  if (chrome.notifications?.getAll) {
    const notifications = await new Promise<object>((resolve, reject) => chrome.notifications.getAll(result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message || 'Visible deadline reminders could not be refreshed.'));
      else resolve(result);
    }));
    for (const name of Object.keys(notifications)) if (name.startsWith(ALARM_PREFIX) && !visible.has(name)) await chrome.notifications.clear(name);
  }
}

/** Return this response from the runtime listener; only accept messages from the same Canvas origin. */
export function handleDeadlineMessage(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; state?: DeadlineTrackingState; error?: string }> {
  return serialized(async () => {
    try {
      const { origin, userId } = validateMessage(message, sender);
      const store = await readStore(), key = scope(origin, userId);
      const previous = store.accounts[key] ?? emptyState();
      if (message.type === 'OFFCANVAS_GET_TRACKING') return { ok: true, state: previous };
      if (!['OFFCANVAS_TRACK_DEADLINES', 'OFFCANVAS_SYNC_DEADLINES'].includes(String(message.type))) throw new Error('Unknown deadline request.');
      const deadlines = validateDeadlines(message.deadlines, origin, userId);
      if (message.type === 'OFFCANVAS_TRACK_DEADLINES' && typeof message.enabled !== 'boolean') throw new Error('Choose whether to enable deadline reminders.');
      const excludedIds = message.excludedIds === undefined ? previous.excludedIds : message.excludedIds;
      if (!Array.isArray(excludedIds) || excludedIds.some(id => typeof id !== 'string') || excludedIds.length > 5000) throw new Error('Invalid reminder selection.');
      const state: DeadlineTrackingState = { enabled: message.type === 'OFFCANVAS_TRACK_DEADLINES' ? message.enabled as boolean : previous.enabled,
        excludedIds, deadlines, updatedAt: new Date().toISOString() };
      store.accounts[key] = state;
      store.activeAccounts[origin] = userId;
      store.delivered = Object.fromEntries(Object.entries(store.delivered).filter(([, timestamp]) => Number(timestamp) > Date.now() - 90 * 24 * HOUR));
      await writeStore(store);
      await scheduleDeadlineReminders();
      return { ok: true, state };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not save deadline reminders.' }; }
  });
}

export function initializeDeadlineReminders(): Promise<void> {
  return serialized(() => scheduleDeadlineReminders());
}

/** Called by chrome.alarms.onAlarm. Validate against the latest saved deadline before notifying. */
export function deliverDeadlineAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return Promise.resolve();
  return serialized(async () => {
    const store = await readStore();
    if (store.delivered[alarm.name]) return;
    for (const state of Object.values(store.accounts)) {
      if (!state.enabled) continue;
      for (const deadline of state.deadlines) {
        if (store.activeAccounts[deadline.origin] !== deadline.userId) continue;
        if (state.excludedIds.includes(deadline.id) || Date.parse(deadline.dueAt) <= Date.now()) continue;
        for (const leadHours of [24, 1] as const) if (alarm.name === reminderName(deadline, leadHours)) {
          await chrome.notifications.create(alarm.name, { type: 'basic', iconUrl: chrome.runtime.getURL('extension/icons/icon128.png'),
            title: `${deadline.courseCode}: assignment due soon`,
            message: `${deadline.title}\nDue ${new Date(deadline.dueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Click to open in Canvas.`, priority: 1 });
          store.delivered[alarm.name] = Date.now(); await writeStore(store);
          return;
        }
      }
    }
  });
}

export function openDeadlineNotification(notificationId: string): Promise<void> {
  if (!notificationId.startsWith(ALARM_PREFIX)) return Promise.resolve();
  return serialized(async () => {
    const store = await readStore();
    for (const state of Object.values(store.accounts)) for (const deadline of state.deadlines) {
      if (!state.enabled || state.excludedIds.includes(deadline.id) || store.activeAccounts[deadline.origin] !== deadline.userId) continue;
      if ([24, 1].some(hours => notificationId === reminderName(deadline, hours as 24 | 1))) {
        await chrome.tabs.create({ url: deadline.url }); await chrome.notifications.clear(notificationId); return;
      }
    }
    await chrome.notifications.clear(notificationId);
  });
}
