import { LOCALE } from './plainLanguage.js';

/** Relative hours by weekday (Sun–Sat). The courses on screen are scaled to WEEKLY_HOURS. */
const WEEK_SHAPE: readonly (readonly number[])[] = [
  [1.0, 2.0, 2.5, 1.5, 2.0, 1.5, 0.0],
  [1.0, 0.5, 0.5, 2.0, 1.0, 1.5, 0.5],
  [0.5, 0.5, 0.5, 0.0, 1.0, 0.5, 0.5],
  [0.0, 0.5, 0.5, 0.5, 0.0, 0.5, 0.0],
  [0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5],
  [0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.5],
];
const WEEKLY_HOURS = 21;

export interface CanvasTimeCourse {
  id: string;
  code: string;
  floor?: number | null;
  ceiling?: number | null;
}

export interface CanvasTimeSlice {
  id: string;
  code: string;
  hours: number;
}

export interface CanvasTimeDay {
  label: string;
  title: string;
  date: number;
  weekday: number;
  aria: string;
  total: number;
  slices: CanvasTimeSlice[];
}

export interface CanvasTimeCourseTotal extends CanvasTimeSlice {
  /** Points between the worst and best final mark. Zero when the mark is settled. */
  span: number | null;
}

export interface CanvasTimeReport {
  days: CanvasTimeDay[];
  courses: CanvasTimeCourseTotal[];
  total: number;
  peak: number;
  /** Where the hours went, set against how far each mark can still move. */
  note: string;
  aside: string;
}

const round1 = (value: number) => Number(value.toFixed(1));

function spanOf(course: CanvasTimeCourse): number | null {
  const { floor, ceiling } = course;
  if (floor == null || ceiling == null || !Number.isFinite(floor) || !Number.isFinite(ceiling)) return null;
  return round1(round1(ceiling) - round1(floor));
}

function points(value: number): string {
  const text = value.toFixed(1);
  return `${text} ${value === 1 ? 'point' : 'points'}`;
}

function hoursText(value: number): string {
  return round1(value).toFixed(1);
}

/** Spread a weekday shape across the courses being shown so the week sums to WEEKLY_HOURS. */
function scaleWeek(courses: number): number[][] {
  const rows = Array.from({ length: courses }, (_, index) => [...WEEK_SHAPE[index % WEEK_SHAPE.length]!]);
  const cells = rows.flatMap((row, course) => row.map((weight, day) => ({ course, day, weight })));
  const weight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const target = Math.round(WEEKLY_HOURS * 10);
  const shares = cells.map(cell => weight ? cell.weight / weight * target : 0);
  const tenths = shares.map(share => Math.floor(share));
  let leftover = target - tenths.reduce((sum, value) => sum + value, 0);
  shares
    .map((share, index) => ({ index, fraction: share - tenths[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .slice(0, leftover)
    .forEach(item => { tenths[item.index]! += 1; });
  return rows.map((row, course) => row.map((_, day) => tenths[cells.findIndex(cell => cell.course === course && cell.day === day)]! / 10));
}

/**
 * A fixed sample week of time on Canvas for the Academics demo.
 * Hours follow the course list, so the chart uses the same courses and colours as the other cards.
 */
export function syntheticCanvasTime(courses: CanvasTimeCourse[], now = new Date()): CanvasTimeReport {
  const scaled = scaleWeek(courses.length);
  const totals = courses.map((course, index) => {
    const pattern = scaled[index] ?? [0, 0, 0, 0, 0, 0, 0];
    const hours = round1(pattern.reduce((sum, value) => sum + value, 0));
    return { id: course.id, code: course.code, hours, span: spanOf(course), pattern };
  });
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days: CanvasTimeDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (6 - index));
    const slices = totals.map(course => ({ id: course.id, code: course.code, hours: course.pattern[date.getDay()]! }));
    const total = round1(slices.reduce((sum, slice) => sum + slice.hours, 0));
    const when = date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    const spent = slices.filter(slice => slice.hours > 0).map(slice => `${slice.code} ${hoursText(slice.hours)} hours`);
    return {
      label: index === 6 ? 'Today' : date.toLocaleDateString(LOCALE, { weekday: 'short' }),
      title: when,
      date: date.getDate(),
      weekday: date.getDay(),
      aria: `${when}: ${spent.length ? `${spent.join(', ')}. ${hoursText(total)} hours in total` : 'no time on Canvas'}`,
      total,
      slices,
    };
  });
  const listed = totals.map(course => ({ id: course.id, code: course.code, hours: course.hours, span: course.span }));
  const total = round1(listed.reduce((sum, course) => sum + course.hours, 0));
  const peak = Math.max(0, ...days.map(day => day.total));
  const active = listed.filter(course => course.hours > 0);
  const busiest = active.reduce<CanvasTimeCourseTotal | undefined>((best, course) => !best || course.hours > best.hours ? course : best, undefined);
  const quietest = active.reduce<CanvasTimeCourseTotal | undefined>((best, course) => !best || course.hours < best.hours ? course : best, undefined);
  const widest = active.reduce<CanvasTimeCourseTotal | undefined>((best, course) => {
    if (course.span == null || course.span <= 0) return best;
    if (!best || best.span == null || course.span > best.span) return course;
    return best;
  }, undefined);

  let note = 'No sample time is attached to these courses.';
  if (busiest && active.length === 1) note = `All ${hoursText(busiest.hours)} hours were in ${busiest.code}.`;
  else if (busiest && widest && widest.id === busiest.id) note = `${busiest.code} took ${hoursText(busiest.hours)} of those hours, and its final mark can still move the furthest, ${points(widest.span!)}.`;
  else if (busiest && widest) note = `${busiest.code} took ${hoursText(busiest.hours)} of those hours. ${widest.code} can still move further, ${points(widest.span!)}, on ${hoursText(widest.hours)} hours.`;
  else if (busiest) note = `${busiest.code} took ${hoursText(busiest.hours)} of those hours.`;

  let aside = '';
  if (busiest && quietest && quietest.id !== busiest.id) {
    aside = quietest.span === 0
      ? `${quietest.code} got ${hoursText(quietest.hours)} hours. That mark is settled.`
      : quietest.span != null
        ? `${quietest.code} got ${hoursText(quietest.hours)} hours, with ${points(quietest.span)} of room left.`
        : `${quietest.code} got ${hoursText(quietest.hours)} hours.`;
  }

  return {
    days,
    courses: listed,
    total,
    peak,
    note,
    aside,
  };
}
