import { expect, it } from 'vitest';
import { DEFAULT_GRADE_POINT_SCALE, DEFAULT_GRADING_SCHEME, type AssignmentGroup } from '../core/schema.js';
import { getAssignmentPriorities, rankDeadlinePriorities, type PrioritizedAssignment } from '../extension/assignmentPriorities.js';
import type { CanvasCourseSnapshot, CanvasLiveAssignment } from '../extension/liveCanvas.js';

const now = Date.parse('2026-11-09T12:00:00Z');
const hour = 60 * 60 * 1000;

function assignment(id: string, hoursFromNow: number, overrides: Partial<CanvasLiveAssignment> = {}): CanvasLiveAssignment {
  return {
    id, name: id, groupId: 'work', pointsPossible: 100, dueAt: new Date(now + hoursFromNow * hour).toISOString(),
    omitFromFinalGrade: false, hasRubric: false, submissionTypes: ['online_upload'],
    htmlUrl: `https://canvas.example/courses/1/assignments/${id}`, descriptionHtml: '', submission: null,
    ...overrides,
  };
}

function group(id: string, weight: number, dropLowest = 0): AssignmentGroup {
  return { id, name: id, weight, rules: { dropLowest, dropHighest: 0, neverDrop: [] } };
}

function course(assignments: CanvasLiveAssignment[], groups: AssignmentGroup[], applyGroupWeights = false): CanvasCourseSnapshot {
  return {
    id: '1', code: 'TEST', name: 'Test course', url: 'https://canvas.example/courses/1', syllabusHtml: '',
    currentScore: null, finalScore: null, assignments, resources: [], announcements: [], calendarEvents: [], issues: [],
    input: {
      course: { id: '1', name: 'Test course', creditHours: 3, applyGroupWeights,
        gradingScheme: DEFAULT_GRADING_SCHEME, gradePointScale: DEFAULT_GRADE_POINT_SCALE },
      groups, assignments, submissions: assignments.flatMap(item => item.submission ? [item.submission] : []),
    },
  };
}

function submission(assignmentId: string, overrides: Partial<NonNullable<CanvasLiveAssignment['submission']>> = {}): NonNullable<CanvasLiveAssignment['submission']> {
  return { assignmentId, score: 78, posted: true, excused: false, missing: false, late: false, workflowState: 'graded', ...overrides };
}

it('ranks five 10% assignments ahead of five 5% assignments and breaks ties by deadline', () => {
  const low = Array.from({ length: 5 }, (_, i) => assignment(`low-${i}`, i + 1, { groupId: 'low' }));
  const high = Array.from({ length: 5 }, (_, i) => assignment(`high-${i}`, i + 10, { groupId: 'high' }));
  const graded = assignment('graded', -1, { groupId: 'exam', submission: submission('graded') });
  const ranked = getAssignmentPriorities([
    course([...low.reverse(), graded, ...high.reverse()], [group('low', 25), group('high', 50), group('exam', 25), group('empty', 10)], true),
  ]);

  expect(ranked.map(task => [task.assignment.id, task.gradeImpact])).toEqual([
    ['high-0', 10], ['high-1', 10], ['high-2', 10], ['high-3', 10], ['high-4', 10],
    ['low-0', 5], ['low-1', 5], ['low-2', 5], ['low-3', 5], ['low-4', 5],
  ]);
});

it('uses the course points denominator for unweighted grades and recalculates drops at full credit', () => {
  const graded = assignment('graded', -1, { submission: submission('graded', { score: 60 }) });
  const work = [graded, assignment('first', 1), assignment('second', 2)];
  const [withoutDrops] = getAssignmentPriorities([course(work, [group('work', 100)])]);
  expect(withoutDrops?.gradeImpact).toBeCloseTo(100 / 3);

  const withDrops = getAssignmentPriorities([course(work, [group('work', 100, 1)])]);
  expect(withDrops.map(task => task.gradeImpact)).toEqual([50, 50]);
});

it('retains due work with zero or unknown impact and excludes undated, locked, and finished work', () => {
  const work = [
    assignment('omitted', 2, { omitFromFinalGrade: true }),
    assignment('zero', 1, { pointsPossible: 0 }),
    assignment('unknown', 1, { groupId: 'missing' }),
    assignment('undated', 1, { dueAt: 'invalid' }),
    assignment('excused', 1, { submission: submission('excused', { excused: true }) }),
    assignment('hidden', 1, { submission: submission('hidden', { score: null, posted: false }) }),
    assignment('handed-in', 1, { submission: submission('handed-in', { score: null, workflowState: 'submitted' }) }),
    assignment('locked', 1, { lockedForUser: true }),
    assignment('overdue', -1),
  ];
  expect(getAssignmentPriorities([course(work, [group('work', 100)])]).map(task => [task.assignment.id, task.gradeImpact])).toEqual([
    ['overdue', 20], ['zero', 0], ['omitted', 0], ['unknown', null],
  ]);
});

it('ranks future deadlines by urgency band, then grade impact and deadline', () => {
  const sampleCourse = course([], []);
  const task = (id: string, hoursFromNow: number, gradeImpact: number): PrioritizedAssignment => ({
    course: sampleCourse, assignment: assignment(id, hoursFromNow), deadline: now + hoursFromNow * hour, gradeImpact,
  });
  const priorities = [
    task('later', 24.001, 60), task('passed', -1, 100), task('now', 0, 100),
    task('two-hours', 2, 10), task('day-low', 3, 5), task('two-hours-low', 1, 5),
    task('one-day', 24, 30), task('just-over-two', 2.001, 30),
  ];

  expect(rankDeadlinePriorities(priorities, now).map(item => item.assignment.id)).toEqual([
    'two-hours', 'two-hours-low', 'just-over-two', 'one-day', 'day-low', 'later',
  ]);
  expect(priorities[0]?.assignment.id).toBe('later');
});
