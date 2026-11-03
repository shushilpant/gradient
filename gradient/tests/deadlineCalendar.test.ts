import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasSnapshot } from '../extension/liveCanvas.js';
import { createDeadlineCalendar, deliverDeadlineAlarm, getSnapshotDeadlines, googleCalendarUrl, handleDeadlineMessage, initializeDeadlineReminders, planDeadlineReminders, type DeadlineTrackingState, type TrackedDeadline } from '../extension/deadlineCalendar.js';

const NOW = Date.parse('2026-11-02T18:00:00Z');
const HOUR = 3600000;
function deadline(overrides: Partial<TrackedDeadline> = {}): TrackedDeadline {
  return { id: 'https://school.instructure.com|42|10|100', origin: 'https://school.instructure.com', userId: '42', courseId: '10', assignmentId: '100', title: 'Homework 1', courseName: 'Physics', courseCode: 'PHYS 101', dueAt: new Date(NOW + 48 * HOUR).toISOString(), url: 'https://school.instructure.com/courses/10/assignments/100', ...overrides };
}
const tracking = (overrides: Partial<DeadlineTrackingState> = {}): DeadlineTrackingState => ({ enabled: true, excludedIds: [], deadlines: [deadline()], updatedAt: new Date(NOW).toISOString(), ...overrides });
const sender = { tab: { id: 1, url: 'https://school.instructure.com/courses/10' } } as chrome.runtime.MessageSender;

function browserMock() {
  const values: Record<string, unknown> = {};
  const alarms = new Map<string, { name: string; scheduledTime: number }>();
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const browser = {
    storage: { local: {
      get: vi.fn(async (key: string) => values[key] === undefined ? {} : { [key]: clone(values[key]) }),
      set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(values, clone(value)); }),
    } },
    alarms: {
      getAll: vi.fn(async () => [...alarms.values()]),
      clear: vi.fn(async (name: string) => alarms.delete(name)),
      create: vi.fn(async (name: string, options: { when: number }) => { alarms.set(name, { name, scheduledTime: options.when }); }),
    },
    notifications: { create: vi.fn(async () => 'notification'), clear: vi.fn(async () => true) },
    runtime: { id: 'extension-id', getURL: (path: string) => `chrome-extension://extension-id/${path}` },
    tabs: { create: vi.fn(async () => ({})) },
  };
  vi.stubGlobal('chrome', browser);
  return { browser, alarms, values };
}
function trackingMessage(deadlines = [deadline()], extra: Record<string, unknown> = {}) {
  return { type: 'GRADIENT_TRACK_DEADLINES', origin: deadline().origin, userId: '42', enabled: true, deadlines, ...extra };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('deadline extraction and portable calendar', () => {
  it('deduplicates assignments and excludes submitted, excused, hidden graded, and invalid dates', () => {
    const assignment = { id: '100', name: 'Homework', dueAt: deadline().dueAt, submission: null };
    const snapshot = { origin: deadline().origin, user: { id: '42' }, courses: [{ id: '10', name: 'Physics', code: 'PHYS 101', assignments: [assignment, assignment,
      { ...assignment, id: '101', dueAt: 'invalid' },
      { ...assignment, id: '102', submission: { workflowState: 'submitted' } },
      { ...assignment, id: '103', submission: { workflowState: 'graded' } },
      { ...assignment, id: '104', submission: { score: 0 } },
      { ...assignment, id: '105', submission: { excused: true } },
    ] }] } as unknown as CanvasSnapshot;
    expect(getSnapshotDeadlines(snapshot)).toHaveLength(1);
    expect(getSnapshotDeadlines(snapshot)[0]?.url).toBe(deadline().url);
  });

  it('uses UTC due times, stable UIDs, native reminders, escaped text and deduplicated events', () => {
    const item = deadline({ title: 'Proof, recursion; notes\nNew line' });
    const first = createDeadlineCalendar([item, item], new Date(NOW));
    const second = createDeadlineCalendar([{ ...item, dueAt: new Date(NOW + 72 * HOUR).toISOString() }], new Date(NOW));
    expect(first.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(first).toContain('SUMMARY:PHYS 101: Proof\\, recursion\\; notes\\nNew line');
    expect(first).toContain('DTSTART:20261104T180000Z');
    expect(first).toContain('TRIGGER:-PT24H');
    expect(first).toContain('TRIGGER:-PT1H');
    expect(first.match(/UID:[^\r\n]+/)?.[0]).toBe(second.match(/UID:[^\r\n]+/)?.[0]);
  });

  it('folds Unicode physical lines to at most 75 UTF-8 octets', () => {
    const calendar = createDeadlineCalendar([deadline({ title: '最終課題の解説と図表'.repeat(30) })], new Date(NOW));
    for (const line of calendar.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(calendar).toContain('\r\n ');
  });

  it('creates a Google calendar template for review with correctly encoded source details', () => {
    const url = new URL(googleCalendarUrl(deadline({ title: 'A & B + C' })));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('PHYS 101: A & B + C');
    expect(url.searchParams.get('dates')).toBe('20261104T180000Z/20261104T181500Z');
    expect(url.searchParams.get('details')).toContain(deadline().url);
  });
});

describe('background reminder scheduling', () => {
  it('plans only future reminders, respects per-assignment selections and ignores disabled tracking', () => {
    expect(planDeadlineReminders(tracking(), NOW).map(r => r.leadHours)).toEqual([24, 1]);
    expect(planDeadlineReminders(tracking({ deadlines: [deadline({ dueAt: new Date(NOW + 2 * HOUR).toISOString() })] }), NOW).map(r => r.leadHours)).toEqual([1]);
    expect(planDeadlineReminders(tracking({ excludedIds: [deadline().id] }), NOW)).toHaveLength(0);
    expect(planDeadlineReminders(tracking({ enabled: false }), NOW)).toHaveLength(0);
    expect(planDeadlineReminders(tracking({ deadlines: [deadline({ dueAt: new Date(NOW - HOUR).toISOString() })] }), NOW)).toHaveLength(0);
  });

  it('reconciles changed dates, removed deadlines, and exclusions without duplicate alarms', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms, browser } = browserMock();
    expect((await handleDeadlineMessage(trackingMessage(), sender)).ok).toBe(true);
    expect(alarms.size).toBe(2);
    await initializeDeadlineReminders();
    expect(browser.alarms.create).toHaveBeenCalledTimes(2);
    const original = [...alarms.keys()];
    const shifted = deadline({ dueAt: new Date(NOW + 72 * HOUR).toISOString() });
    await handleDeadlineMessage(trackingMessage([shifted]), sender);
    expect(alarms.size).toBe(2);
    expect(original.every(name => !alarms.has(name))).toBe(true);
    await handleDeadlineMessage(trackingMessage([shifted], { excludedIds: [shifted.id] }), sender);
    expect(alarms.size).toBe(0);
    await handleDeadlineMessage(trackingMessage([shifted], { excludedIds: [] }), sender);
    expect(alarms.size).toBe(2);
    await handleDeadlineMessage({ ...trackingMessage([]), type: 'GRADIENT_SYNC_DEADLINES' }, sender);
    expect(alarms.size).toBe(0);
  });

  it('does not enable tracking merely because Canvas refreshed', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms } = browserMock();
    const response = await handleDeadlineMessage({ ...trackingMessage(), type: 'GRADIENT_SYNC_DEADLINES' }, sender);
    expect(response.state?.enabled).toBe(false);
    expect(alarms.size).toBe(0);
  });

  it('preserves other accounts when one account pauses reminders', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms } = browserMock();
    await handleDeadlineMessage(trackingMessage(), sender);
    const other = deadline({ userId: '43', id: 'https://school.instructure.com|43|10|100' });
    await handleDeadlineMessage(trackingMessage([other], { userId: '43' }), sender);
    expect(alarms.size).toBe(4);
    await handleDeadlineMessage(trackingMessage([deadline()], { enabled: false }), sender);
    expect(alarms.size).toBe(2);
    expect([...alarms.keys()].every(key => key.includes(encodeURIComponent(other.id)))).toBe(true);
  });

  it('rejects cross-origin tab requests and links outside the Canvas assignment', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms } = browserMock();
    const foreignSender = { tab: { url: 'https://attacker.example' } } as chrome.runtime.MessageSender;
    expect((await handleDeadlineMessage(trackingMessage(), foreignSender)).ok).toBe(false);
    expect((await handleDeadlineMessage(trackingMessage([deadline({ url: 'https://attacker.example' })]), sender)).ok).toBe(false);
    expect((await handleDeadlineMessage(trackingMessage([deadline({ url: `${deadline().origin}/courses/10/settings` })]), sender)).ok).toBe(false);
    expect(alarms.size).toBe(0);
  });

  it('delivers a reminder only once even when alarm callbacks race and the worker restarts', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms, browser } = browserMock();
    await handleDeadlineMessage(trackingMessage(), sender);
    const alarm = [...alarms.values()][0]!;
    vi.setSystemTime(alarm.scheduledTime);
    await Promise.all([deliverDeadlineAlarm(alarm), deliverDeadlineAlarm(alarm)]);
    expect(browser.notifications.create).toHaveBeenCalledTimes(1);
    await initializeDeadlineReminders();
    expect(alarms.has(alarm.name)).toBe(false);
    await deliverDeadlineAlarm(alarm);
    expect(browser.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale callback after a due date changes or the assignment is submitted', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { alarms, browser } = browserMock();
    await handleDeadlineMessage(trackingMessage(), sender);
    const old = [...alarms.values()][0]!;
    await handleDeadlineMessage(trackingMessage([deadline({ dueAt: new Date(NOW + 72 * HOUR).toISOString() })]), sender);
    await deliverDeadlineAlarm(old);
    expect(browser.notifications.create).not.toHaveBeenCalled();
    const current = [...alarms.values()][0]!;
    await handleDeadlineMessage({ ...trackingMessage([]), type: 'GRADIENT_SYNC_DEADLINES' }, sender);
    await deliverDeadlineAlarm(current);
    expect(browser.notifications.create).not.toHaveBeenCalled();
  });
});
