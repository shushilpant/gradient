import { getLetterGrade } from '../core/grade.js';
import { currentGrade } from '../core/gradeModel.js';
import type { CanvasCourseSnapshot } from './liveCanvas.js';
import { gradeRange, letterFor } from './plainLanguage.js';

export interface GradeInsight {
  percentage: number | null;
  letter: string | null;
  matchesCanvas: boolean;
  canvasPercentage: number | null;
  floor: number | null;
  ceiling: number | null;
  /** Whether the next letter is still reachable with open work. */
  climb: string;
  /** How far the final mark can still move. */
  stakes: string;
}

const MARK_SCALE_MIN = 50;

/** Position on the same 50–100 band scale the standing chart uses. */
export function markScale(value: number): string {
  const clamped = Math.min(100, Math.max(MARK_SCALE_MIN, value));
  return `${(clamped - MARK_SCALE_MIN) / (100 - MARK_SCALE_MIN) * 100}%`;
}

function points(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'point' : 'points'}`;
}

function article(letter: string, capital = false): string {
  const word = /^[AEF]/i.test(letter) ? 'an' : 'a';
  return capital ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word;
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * What the rebuilt mark still means: the next letter, whether open work can reach it,
 * and how far the final mark can fall if that work scores nothing.
 */
export function gradeInsight(course: CanvasCourseSnapshot): GradeInsight {
  const rebuilt = currentGrade(course.input).percentage;
  const range = gradeRange(course);
  const percentage = rebuilt ?? null;
  const letter = letterFor(course, percentage);
  const scheme = [...course.input.course.gradingScheme].sort((a, b) => b.minPct - a.minPct);
  const index = letter ? scheme.findIndex(item => item.letter === letter) : -1;
  const next = index > 0 ? scheme[index - 1] : null;
  const gap = next && percentage != null ? Math.max(0, next.minPct - percentage) : null;
  const reachable = next != null && range.ceiling != null && range.ceiling + 0.049 >= next.minPct;
  const climb = percentage == null
    ? 'No marked work yet'
    : next == null
      ? 'Already at the top of the scale'
      : reachable
        ? `${points(gap ?? 0)} short of ${article(next.letter)} ${next.letter}`
        : `${article(next.letter, true)} ${next.letter} is out of reach`;

  const floor = range.floor;
  const ceiling = range.ceiling;
  const floorLetter = floor == null ? null : getLetterGrade(floor, course.input.course.gradingScheme);
  const settled = percentage != null && floor != null && ceiling != null
    && Math.abs(ceiling - floor) < 0.05;
  const drop = floorLetter && letter && floorLetter !== letter ? `, down to ${article(floorLetter)} ${floorLetter}` : '';
  const stakes = percentage == null && floor != null && ceiling != null
    ? `It can still finish from ${percent(ceiling)} to ${percent(floor)}`
    : settled && percentage != null
      ? `The mark is settled at ${percent(percentage)}`
      : floor != null && ceiling != null
        ? `Final mark can still land from ${percent(ceiling)} to ${percent(floor)}${drop}`
        : 'The final range could not be calculated';

  return {
    percentage,
    letter,
    matchesCanvas: percentage != null && course.currentScore != null && Math.abs(percentage - course.currentScore) < 0.05,
    canvasPercentage: course.currentScore,
    floor,
    ceiling,
    climb,
    stakes,
  };
}
