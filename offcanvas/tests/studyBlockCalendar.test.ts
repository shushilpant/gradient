import { describe, expect, it } from 'vitest';
import { exportScheduleToICS, parseICSToBusyBlocks } from '../core/icsParser.js';
import { createFirstStudyBlock } from '../extension/ui/StudyBlockCalendar.js';

const now = new Date('2026-11-09T12:00:00').getTime();
const study = {
  accountScope: 'https://school.instructure.com|student',
  recommendation: {
    courseId: 'course',
    assignmentId: 'assignment',
    name: 'Graph traversal',
    hours: 2,
    code: 'CS-101',
    dueAt: new Date('2026-11-09T14:30:00').toISOString(),
  },
};

describe('first study block export', () => {
  it('exports a timed 30-minute block in the student’s local time and scopes its UID', () => {
    const first = createFirstStudyBlock(study, '2026-11-09T14:00', now);
    const moved = createFirstStudyBlock(study, '2026-11-09T13:00', now);
    const otherAccount = createFirstStudyBlock({ ...study, accountScope: 'another account' }, '2026-11-09T14:00', now);
    if (!('block' in first && 'block' in moved && 'block' in otherAccount)) throw new Error('Expected valid blocks');
    expect(first.block.durationMinutes).toBe(30);
    expect(first.block.id).toBe(moved.block.id);
    expect(first.block.id).not.toBe(otherAccount.block.id);
    expect(parseICSToBusyBlocks(exportScheduleToICS([first.block]))).toEqual([expect.objectContaining({
      startTime: new Date('2026-11-09T14:00:00').toISOString(),
      endTime: study.recommendation.dueAt,
    })]);
  });

  it('rejects invalid, past and post-deadline times but accepts work without a deadline', () => {
    expect(createFirstStudyBlock(study, '2026-11-31T12:00', now)).toEqual({ error: 'Choose a valid start date and time.' });
    expect(createFirstStudyBlock(study, '2026-11-09T11:59', now)).toEqual({ error: 'Choose a start time in the future.' });
    expect(createFirstStudyBlock(study, '2026-11-09T14:01', now)).toEqual({ error: 'The study block must end by the assignment deadline.' });
    expect(createFirstStudyBlock({ ...study, recommendation: { ...study.recommendation, dueAt: null } }, '2026-11-10T18:00', now)).toHaveProperty('block');
  });

  it('escapes Canvas titles and folds long UTF-8 calendar lines', () => {
    const name = `Graphs, paths; and trees ${'é'.repeat(50)}\r\nBEGIN:VEVENT`;
    const result = createFirstStudyBlock({ ...study, recommendation: { ...study.recommendation, name } }, '2026-11-09T14:00', now);
    if (!('block' in result)) throw new Error('Expected a valid block');
    const ics = exportScheduleToICS([result.block]);
    const lines = ics.split('\r\n');
    expect(lines.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(parseICSToBusyBlocks(ics)[0]?.title).toContain('Graphs, paths; and trees');
  });
});
