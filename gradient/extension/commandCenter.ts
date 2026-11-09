import type { CanvasSnapshot, CanvasCourseSnapshot, CanvasLiveAssignment } from './liveCanvas.js';

export type CommandIntent = 'briefing' | 'search' | 'prepare' | 'explain' | 'teach' | 'focus' | 'resize' | 'move' | 'remember' | 'forget' | 'stop' | 'help';
export interface ParsedCommand { intent: CommandIntent; text: string; minutes?: number; query: string }
export interface MissionTask { course: CanvasCourseSnapshot; assignment: CanvasLiveAssignment }
export interface MemoryNote { id: string; text: string; createdAt: string }
export interface MissionBlock { id: string; title: string; courseId: string; assignmentId: string; url: string; start: string; end: string; completed: boolean }
export interface ChangeRecord { id: string; title: string; detail: string; url: string; courseId: string }
export interface AssignmentBaseline { title: string; dueAt: string | null; description: string; rubric: string; url: string; courseId: string }
export interface CommandState {
  notes: MemoryNote[];
  blocks: MissionBlock[];
  baseline: Record<string, AssignmentBaseline>;
  changes: ChangeRecord[];
  updatedAt: string;
}
export const emptyCommandState = (): CommandState => ({ notes: [], blocks: [], baseline: {}, changes: [], updatedAt: '' });
export const accountKey = (snapshot: CanvasSnapshot) => `gradient_command_v1:${encodeURIComponent(snapshot.origin)}:${encodeURIComponent(snapshot.user.id)}`;

/** Deliberately bounded commands: course text and model output never execute actions. */
export function parseCommand(text: string): ParsedCommand {
  const clean = text.trim().slice(0, 4000);
  const lower = clean.toLowerCase();
  const duration = lower.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/);
  const minutes = duration ? Math.max(5, Math.min(480, Math.round(Number(duration[1]) * (/^h/.test(duration[2]!) ? 60 : 1)))) : undefined;
  let intent: CommandIntent = 'help';
  if (/^(?:stop|cancel|pause|never mind|nevermind)\b/.test(lower)) intent = 'stop';
  else if (/^(?:forget|delete memory|clear memory)\b/.test(lower)) intent = 'forget';
  else if (/^(?:remember|note that)\b/.test(lower)) intent = 'remember';
  else if (/\b(move|reschedule|postpone)\b/.test(lower)) intent = 'move';
  else if (/\b(actually|only have|instead|shorten|less time|more time)\b/.test(lower) && minutes !== undefined) intent = 'resize';
  else if (/\b(teach.*back|test my understanding|my explanation|check my explanation)\b/.test(lower)) intent = 'teach';
  else if (/\b(explain|looking at|this page|selected text|selection)\b/.test(lower)) intent = 'explain';
  else if (/\b(find|search|look up|locate)\b/.test(lower)) intent = 'search';
  else if (/\b(prepare|exam|revision|revise|rescue|plan my|plan for|study plan)\b/.test(lower)) intent = 'prepare';
  else if (/\b(focus|timer|pomodoro|get me started|i have)\b/.test(lower) && (minutes !== undefined || /focus|timer|pomodoro/.test(lower))) intent = 'focus';
  else if (/\b(brief|attention|today|morning|what.*due|what.*next|updates|my week)\b/.test(lower)) intent = 'briefing';
  const query = clean.replace(/^(?:please\s+)?(?:find|search(?: for)?|look up|locate|remember(?: that)?|note that|forget)\s*/i, '').trim();
  return { intent, text: clean, minutes, query };
}
export function outstanding(assignment: CanvasLiveAssignment): boolean {
  return !assignment.submission?.excused && assignment.submission?.score == null && !['submitted', 'pending_review', 'graded'].includes(assignment.submission?.workflowState ?? '');
}
export function missionTasks(snapshot: CanvasSnapshot, now = Date.now()): MissionTask[] {
  return snapshot.courses.flatMap(course => course.assignments.filter(outstanding).map(assignment => ({ course, assignment })))
    .sort((a, b) => {
      const priority = (task: MissionTask) => {
        const due = task.assignment.dueAt ? Date.parse(task.assignment.dueAt) : NaN;
        return Number.isFinite(due) ? Math.max(now - 86400000, due) : Infinity;
      };
      return priority(a) - priority(b) || b.assignment.pointsPossible - a.assignment.pointsPossible;
    });
}
const stopWords = new Set('find search for the a an me my where we covered lecture lectures material materials about explain prepare exam friday monday tuesday wednesday thursday saturday sunday this next week study plan rescue revision please on in of to'.split(' '));
export function queryWords(query: string): string[] { return [...new Set(query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].filter(word => !stopWords.has(word)); }
export function matchCourse(snapshot: CanvasSnapshot, query: string): CanvasCourseSnapshot | undefined {
  const words = queryWords(query);
  const ranked = snapshot.courses.map(course => ({ course, score: words.filter(word => `${course.name} ${course.code}`.toLowerCase().includes(word)).length })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].course : undefined;
}
export function searchCoursework(snapshot: CanvasSnapshot, query: string): { title: string; url: string; course: string; kind: string }[] {
  const words = queryWords(query);
  if (!words.length) return [];
  return snapshot.courses.flatMap(course => [
    ...course.resources.map(resource => ({ title: resource.title, url: resource.url, course: course.code, kind: resource.type })),
    ...course.assignments.map(assignment => ({ title: assignment.name, url: assignment.htmlUrl, course: course.code, kind: 'assignment' })),
    ...course.announcements.map(item => ({ title: item.title, url: item.url, course: course.code, kind: 'announcement' })),
  ]).map(item => ({ ...item, score: words.filter(word => `${item.title} ${item.course}`.toLowerCase().includes(word)).length }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
}
export function snapshotBaseline(snapshot: CanvasSnapshot): Record<string, AssignmentBaseline> {
  return Object.fromEntries(snapshot.courses.flatMap(course => course.assignments.map(a => [`${course.id}/${a.id}`, {
    title: a.name, dueAt: a.dueAt ?? null, description: a.descriptionHtml, rubric: JSON.stringify(a.rubric ?? []), url: a.htmlUrl, courseId: course.id,
  }])));
}
function changedInstructionExcerpt(before: string, after: string): string {
  const text = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const oldText = text(before), newText = text(after);
  let offset = 0;
  while (offset < Math.min(oldText.length, newText.length) && oldText[offset] === newText[offset]) offset++;
  if (offset === oldText.length && offset === newText.length) return 'Assignment formatting or linked content changed. Review the current brief.';
  const start = Math.max(0, offset - 45);
  return `Before: “${oldText.slice(start, offset + 180) || '(empty)'}”\nNow: “${newText.slice(start, offset + 180) || '(empty)'}”`;
}
export function detectMissionChanges(before: Record<string, AssignmentBaseline>, after: Record<string, AssignmentBaseline>): ChangeRecord[] {
  if (!Object.keys(before).length) return [];
  return Object.entries(after).flatMap(([id, current]) => {
    const previous = before[id];
    if (!previous) return [{ id: `${id}:new`, title: `New assignment: ${current.title}`, detail: 'Added since your previous sync.', url: current.url, courseId: current.courseId }];
    const changes: ChangeRecord[] = [];
    if (current.dueAt !== previous.dueAt) changes.push({ id: `${id}:deadline`, title: `Deadline changed: ${current.title}`, detail: `${previous.dueAt ? new Date(previous.dueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No date'} → ${current.dueAt ? new Date(current.dueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No date'}`, url: current.url, courseId: current.courseId });
    if (current.description !== previous.description || current.rubric !== previous.rubric) changes.push({ id: `${id}:requirements`, title: `Requirements changed: ${current.title}`, detail: current.rubric !== previous.rubric ? 'The rubric changed. Review the current criteria before continuing.' : changedInstructionExcerpt(previous.description, current.description), url: current.url, courseId: current.courseId });
    return changes;
  });
}

/** Schedule only in available local daytime, before deadlines, around known Canvas events. */
export function planMission(tasks: MissionTask[], minutes: number, snapshot: CanvasSnapshot, existing: MissionBlock[] = [], start = new Date()): { blocks: MissionBlock[]; unscheduledMinutes: number } {
  const completed = existing.filter(block => block.completed).slice(-200);
  const blocks = [...completed];
  let remaining = Math.max(0, Math.min(480, Math.round(minutes)));
  let cursor = Math.ceil(start.getTime() / 300000) * 300000;
  const horizon = cursor + 7 * 86400000;
  const busy = snapshot.courses.flatMap(course => course.calendarEvents).flatMap(event => {
    const from = Date.parse(event.startAt ?? ''), to = Date.parse(event.endAt ?? '');
    return Number.isFinite(from) && Number.isFinite(to) && to > from ? [{ from, to }] : [];
  });
  for (const task of tasks.slice(0, 8)) {
    if (remaining <= 0) break;
    const due = Date.parse(task.assignment.dueAt ?? '');
    if (Number.isFinite(due) && due <= cursor) continue;
    let allocation = Math.min(remaining, Math.max(5, Math.round(minutes / Math.min(tasks.length, 4))));
    while (allocation > 0 && remaining > 0 && cursor < horizon) {
      const date = new Date(cursor);
      if (date.getHours() < 8 || date.getHours() >= 22) {
        if (date.getHours() >= 22) date.setDate(date.getDate() + 1);
        date.setHours(8, 0, 0, 0); cursor = date.getTime(); continue;
      }
      const dayEnd = new Date(cursor); dayEnd.setHours(22, 0, 0, 0);
      const duration = Math.min(25, allocation, remaining);
      const end = cursor + duration * 60000;
      if (end > dayEnd.getTime()) { cursor = dayEnd.getTime(); continue; }
      const overlap = [...busy, ...blocks.map(block => ({ from: Date.parse(block.start), to: Date.parse(block.end) }))].find(b => cursor < b.to && end > b.from);
      if (overlap) { cursor = Math.ceil(overlap.to / 300000) * 300000; continue; }
      if (Number.isFinite(due) && end > due) break;
      blocks.push({ id: `${task.course.id}-${task.assignment.id}-${cursor}`, title: task.assignment.name, courseId: task.course.id, assignmentId: task.assignment.id, url: task.assignment.htmlUrl, start: new Date(cursor).toISOString(), end: new Date(end).toISOString(), completed: false });
      remaining -= duration; allocation -= duration; cursor = end + 5 * 60000;
    }
  }
  return { blocks, unscheduledMinutes: remaining };
}
export function missionCalendar(blocks: MissionBlock[], scope: string, now = new Date()): string {
  const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GRADIENT//Mission Plan//EN', 'CALSCALE:GREGORIAN'];
  for (const block of blocks.filter(b => !b.completed)) lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(scope)}-${block.id}@gradient.local`, `DTSTAMP:${stamp(now.toISOString())}`, `DTSTART:${stamp(block.start)}`, `DTEND:${stamp(block.end)}`, `SUMMARY:${escape(`Study: ${block.title}`)}`, `DESCRIPTION:${escape(block.url)}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(line => { let result = '', length = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (length + bytes > 75) { result += '\r\n '; length = 1; } result += char; length += bytes; } return result; }).join('\r\n') + '\r\n';
}
