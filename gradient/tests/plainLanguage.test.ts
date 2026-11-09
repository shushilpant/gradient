import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../extension/demoScenario.js';
import { courseBriefing, gradeRange, numbersGrounded, overviewBriefing, relativeDue, standingWord } from '../extension/plainLanguage.js';
import type { CanvasLiveAssignment } from '../extension/liveCanvas.js';

const now = new Date('2026-11-09T12:00:00Z');
const snapshot = createDemoSnapshot('http://127.0.0.1:8085', now);
const due = (dueAt: string | null, submission?: CanvasLiveAssignment['submission']) => ({ ...snapshot.courses[0]!.assignments[0]!, dueAt, submission }) as CanvasLiveAssignment;

describe('Plain-language readings', () => {
  it('describes deadlines in calendar days', () => {
    expect(relativeDue(due('2026-11-09T18:00:00Z'), now)).toBe('Due today');
    expect(relativeDue(due('2026-11-10T18:00:00Z'), now)).toBe('Due tomorrow');
    expect(relativeDue(due('2026-11-07T09:00:00Z'), now)).toBe('2 days overdue');
    expect(relativeDue(due('2026-11-30T09:00:00Z'), now)).toBe('Due 30 Nov');
    expect(relativeDue(due(null), now)).toBe('No due date');
  });

  it('maps percentages to everyday words', () => {
    expect([95, 85, 75, 50, null].map(standingWord)).toEqual(['Excellent', 'Good', 'Fair', 'At risk', 'No marks yet']);
  });

  it('keeps every figure in a briefing inside its own facts', () => {
    const overview = overviewBriefing(snapshot, now);
    expect(numbersGrounded(overview.body, overview.facts)).toBe(true);
    for (const course of snapshot.courses) {
      const briefing = courseBriefing(course, now);
      expect(numbersGrounded(briefing.body, briefing.facts)).toBe(true);
      const range = gradeRange(course);
      if (range.floor != null && range.ceiling != null) expect(range.floor).toBeLessThanOrEqual(range.ceiling);
    }
  });

  it('rejects rewordings that invent numbers', () => {
    const facts = { 'courses at 80% or above': 3, 'LIVE-101 current mark': '90.7%' };
    expect(numbersGrounded('All 3 courses are at 80% or above; LIVE-101 sits at 90.7%.', facts)).toBe(true);
    expect(numbersGrounded('LIVE-101 should reach 95% by Friday.', facts)).toBe(false);
  });
});
