/** Deterministic, plain-English readings of Canvas data. The local model may reword these facts but never add to them. */
import type { CanvasCourseSnapshot, CanvasLiveAssignment, CanvasSnapshot } from './liveCanvas.js';
import { bestCase, currentGrade, getLetterGrade, worstCase } from '../core/gradeModel.js';

export const LOCALE = 'en-GB';
const DAY = 86400000;

export function isPending(a: CanvasLiveAssignment): boolean {
  const state = a.submission?.workflowState;
  return !a.submission?.excused && a.submission?.score == null && state !== 'submitted' && state !== 'pending_review' && state !== 'graded';
}
export function isSubmitted(a: CanvasLiveAssignment): boolean {
  return a.submission?.score == null && (a.submission?.workflowState === 'submitted' || a.submission?.workflowState === 'pending_review');
}
export function isGraded(a: CanvasLiveAssignment): boolean {
  return !a.submission?.excused && (a.submission?.score != null || a.submission?.workflowState === 'graded');
}
export function dueTime(a: CanvasLiveAssignment): number {
  const time = a.dueAt ? Date.parse(a.dueAt) : NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}
export function isOverdue(a: CanvasLiveAssignment, now = Date.now()): boolean {
  return isPending(a) && dueTime(a) < now;
}

function dayKey(d: Date): number { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
export function daysUntil(time: number, now = new Date()): number { return Math.round((dayKey(new Date(time)) - dayKey(now)) / DAY); }

export function longDay(time: number): string { return new Date(time).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }); }
export function shortDate(time: number): string { return new Date(time).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }); }
export function clockTime(time: number): string { return new Date(time).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }); }

/** "Due today", "Due Tuesday", "3 days overdue" — calendar days in the student's timezone. */
export function relativeDue(a: CanvasLiveAssignment, now = new Date()): string {
  const time = dueTime(a);
  if (!Number.isFinite(time)) return 'No due date';
  const days = daysUntil(time, now);
  if (time < now.getTime() && isPending(a)) return days === 0 ? 'Due earlier today' : `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  if (days < 0) return `Was due ${shortDate(time)}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due ${new Date(time).toLocaleDateString(LOCALE, { weekday: 'long' })}`;
  return `Due ${shortDate(time)}`;
}

export function letterFor(course: CanvasCourseSnapshot, pct: number | null | undefined): string | null {
  return pct == null ? null : getLetterGrade(pct, course.input.course.gradingScheme);
}

/** How a percentage reads to someone who does not think in grade boundaries. */
export function standingWord(pct: number | null | undefined): 'Excellent' | 'Good' | 'Fair' | 'At risk' | 'No marks yet' {
  if (pct == null) return 'No marks yet';
  if (pct >= 90) return 'Excellent';
  if (pct >= 80) return 'Good';
  return pct >= 70 ? 'Fair' : 'At risk';
}

export interface GradeRange { current: number | null; floor: number | null; ceiling: number | null; remainingPoints: number; }
/** Lowest and highest final grade still possible, from Canvas's own grading rules. */
export function gradeRange(course: CanvasCourseSnapshot): GradeRange {
  const remainingPoints = course.assignments.filter(a => isPending(a) && !a.omitFromFinalGrade).reduce((n, a) => n + a.pointsPossible, 0);
  try {
    return { current: currentGrade(course.input).percentage ?? course.currentScore, floor: worstCase(course.input).percentage, ceiling: bestCase(course.input).percentage, remainingPoints };
  } catch {
    return { current: course.currentScore, floor: null, ceiling: null, remainingPoints };
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Briefing { headline: string; body: string; facts: Record<string, string | number>; }

export function overviewBriefing(snapshot: CanvasSnapshot, now = new Date()): Briefing {
  const items = snapshot.courses.flatMap(course => course.assignments.map(assignment => ({ course, assignment })));
  const todo = items.filter(t => isPending(t.assignment));
  const overdue = todo.filter(t => isOverdue(t.assignment, now.getTime()));
  const upcoming = todo.filter(t => dueTime(t.assignment) >= now.getTime()).sort((a, b) => dueTime(a.assignment) - dueTime(b.assignment));
  const week = upcoming.filter(t => daysUntil(dueTime(t.assignment), now) < 7);
  const next = upcoming[0];
  const graded = snapshot.courses.filter(c => c.currentScore != null);
  const atRisk = graded.filter(c => (c.currentScore ?? 0) < 70);
  const strong = graded.filter(c => (c.currentScore ?? 0) >= 80);
  const headline = overdue.length ? `${capital(words(overdue.length))} ${overdue.length === 1 ? 'piece' : 'pieces'} of work ${overdue.length === 1 ? 'is' : 'are'} overdue.`
    : week.length ? `${capital(words(week.length))} ${week.length === 1 ? 'deadline' : 'deadlines'} this week.`
    : 'A clear week ahead.';
  const parts: string[] = [];
  parts.push(todo.length ? `You have ${plural(todo.length, 'piece')} of work still to do${overdue.length ? `, and ${overdue.length} of ${todo.length === 1 ? 'it is' : 'them are'} past the deadline` : ''}.` : 'Everything set so far has been handed in.');
  if (next) parts.push(`The next deadline is ${next.assignment.name} for ${next.course.code}, ${daysUntil(dueTime(next.assignment), now) === 0 ? 'due today' : `due ${longDay(dueTime(next.assignment))}`}.`);
  if (graded.length) parts.push(atRisk.length ? `${atRisk.map(c => c.code).join(' and ')} ${atRisk.length === 1 ? 'needs' : 'need'} attention; the rest look steady.`
    : strong.length === graded.length ? `Your marks are healthy: ${graded.length === 1 ? 'your course is' : `all ${words(graded.length)} courses are`} at 80% or above.`
    : `${plural(strong.length, 'course')} ${strong.length === 1 ? 'is' : 'are'} at 80% or above.`);
  const facts: Record<string, string | number> = {
    'work still to do': todo.length, 'overdue pieces of work': overdue.length, 'deadlines in the next 7 days': week.length,
    'courses': graded.length, 'courses at 80% or above': strong.length, 'courses below 70%': atRisk.length,
  };
  if (next) Object.assign(facts, { 'next deadline': next.assignment.name, 'next deadline course': next.course.code, 'next deadline date': longDay(dueTime(next.assignment)) });
  overdue.slice(0, 3).forEach((t, i) => { facts[`overdue item ${i + 1}`] = `${t.assignment.name} (${t.course.code})`; });
  graded.forEach(c => { facts[`${c.code} current mark`] = `${round1(c.currentScore!)}%`; });
  return { headline, body: parts.join(' '), facts };
}

export function courseBriefing(course: CanvasCourseSnapshot, now = new Date()): Briefing {
  const range = gradeRange(course);
  const todo = course.assignments.filter(isPending);
  const overdue = todo.filter(a => isOverdue(a, now.getTime()));
  const letter = letterFor(course, range.current);
  const parts: string[] = [];
  if (range.current == null) parts.push(`${course.code} has no marked work yet, so there is no grade to read.`);
  else parts.push(`You are on ${round1(range.current)}% in ${course.code}${letter ? `, which is ${/^[AEFIOU]/.test(letter) ? 'an' : 'a'} ${letter}` : ''}. That figure only counts work that has been marked.`);
  if (range.floor != null && range.ceiling != null && range.remainingPoints > 0) {
    parts.push(`With ${plural(range.remainingPoints, 'point')} still to earn, your final mark can land anywhere between ${round1(range.floor)}% (if nothing else is handed in) and ${round1(range.ceiling)}% (if everything left is perfect).`);
  } else if (range.current != null) parts.push('All work that counts has been marked, so this is very close to your final mark.');
  if (overdue.length) parts.push(`${overdue[0]!.name} is overdue; handing it in, even late, is the quickest way to protect your mark.`);
  const nextUp = overdue.length ? undefined : todo.slice().sort((a, b) => dueTime(a) - dueTime(b))[0];
  if (nextUp) parts.push(`Next to do: ${nextUp.name}.`);
  const facts: Record<string, string | number> = { course: `${course.code} (${course.name})`, 'pieces of work still to do': todo.length, 'overdue pieces of work': overdue.length };
  if (range.current != null) facts['current mark (marked work only)'] = `${round1(range.current)}%`;
  if (letter) facts['current letter grade'] = letter;
  if (range.floor != null) facts['lowest possible final mark'] = `${round1(range.floor)}%`;
  if (range.ceiling != null) facts['highest possible final mark'] = `${round1(range.ceiling)}%`;
  if (range.remainingPoints) facts['points still available across all remaining work'] = range.remainingPoints;
  overdue.slice(0, 2).forEach((a, i) => { facts[`overdue item ${i + 1}`] = a.name; });
  if (nextUp) facts['next piece of work'] = nextUp.name;
  return { headline: letter ? `${letter} so far` : 'Not yet marked', body: parts.join(' '), facts };
}

/** Mirrors the backend guard: an explanation may only contain figures present in its facts. */
export function numbersGrounded(text: string, facts: Record<string, string | number>): boolean {
  const pattern = /\d+(?:\.\d+)?/g;
  const known = new Set<string>();
  for (const [key, value] of Object.entries(facts)) for (const n of `${key} ${value}`.match(pattern) ?? []) { known.add(n); known.add(String(Math.trunc(Number(n)))); known.add(Number(n).toFixed(1)); }
  return (text.match(pattern) ?? []).every(n => known.has(n));
}
