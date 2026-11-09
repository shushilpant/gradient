import { describe, expect, it } from 'vitest';
import rawCourses from '../sandbox/fixtures/sandbox_all_courses.json';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';
import { createDemoSnapshot } from '../extension/demoScenario.js';
import { allocateStudySplit, type StudySplitCourse } from '../extension/studySplit.js';
import type { CanvasLiveAssignment } from '../extension/liveCanvas.js';

const adapter = new CanvasAdapter();
const NOW = new Date('2026-11-09T12:00:00Z');

function live(assignment: { id: string; name: string; groupId: string; pointsPossible: number; dueAt?: string | null; submissionTypes?: string[] }, submission: CanvasLiveAssignment['submission'] = null): CanvasLiveAssignment {
  return {
    id: assignment.id,
    groupId: assignment.groupId,
    name: assignment.name,
    pointsPossible: assignment.pointsPossible,
    dueAt: assignment.dueAt ?? null,
    submissionTypes: assignment.submissionTypes ?? ['online_upload'],
    omitFromFinalGrade: false,
    hasRubric: false,
    htmlUrl: 'https://canvas.example/assignments/' + assignment.id,
    descriptionHtml: '',
    submission,
  };
}

function course(partial: {
  code: string;
  creditHours?: number;
  weights?: boolean;
  groups: { id: string; name: string; weight?: number; dropLowest?: number }[];
  assignments: CanvasLiveAssignment[];
}): StudySplitCourse {
  const groups = adapter.parseAssignmentGroups(partial.groups.map(group => ({
    id: group.id, name: group.name, group_weight: group.weight ?? 0,
    rules: { drop_lowest: group.dropLowest ?? 0, drop_highest: 0, never_drop: [] },
  })));
  const assignments = partial.assignments.map(({ htmlUrl: _html, descriptionHtml: _htmlBody, submission: _submission, lockedForUser: _locked, ...assignment }) => assignment);
  return {
    code: partial.code,
    assignments: partial.assignments,
    input: {
      course: adapter.parseCourse({ id: partial.code, name: partial.code, apply_assignment_group_weights: partial.weights ?? false }, partial.creditHours ?? 3),
      groups,
      assignments,
      submissions: partial.assignments.flatMap(assignment => assignment.submission ? [assignment.submission] : []),
      priorityWeight: 1,
    },
  };
}

function hoursOf(plan: { name: string; hours: number }[], name: string): number {
  return plan.find(item => item.name === name)?.hours ?? 0;
}

describe('study split', () => {
  it('gives the urgent counted assignment more time than an undated exam on the demo courses', () => {
    const plan = allocateStudySplit(createDemoSnapshot('http://127.0.0.1:8085', NOW).courses, 8, NOW);
    expect(plan.reduce((sum, item) => sum + item.hours, 0)).toBe(8);
    expect(hoursOf(plan, 'HW 5: Greedy Algorithms')).toBeGreaterThan(hoursOf(plan, 'Homework: Probability study outline'));
    expect(hoursOf(plan, 'Homework: Probability study outline')).toBeGreaterThan(hoursOf(plan, 'Final Exam'));
    expect(hoursOf(plan, 'Final Exam')).toBeGreaterThan(0);
    expect(hoursOf(plan, 'Homework: Graph traversal planning')).toBe(0);
    expect(hoursOf(plan, 'Lab planning: Enzyme experiment')).toBe(0);
    expect(plan.some(item => item.name.startsWith('HW 4'))).toBe(false);
    expect(plan[0]?.reason).toContain('Due tomorrow');
  });

  it('prefers the heavier grade category when every deadline is the same', () => {
    const fixtures = structuredClone(rawCourses) as Array<Record<string, any>>;
    for (const raw of fixtures) {
      for (const assignment of raw.assignments) assignment.due_at = '2026-11-12T23:59:00Z';
      raw.submissions = [];
    }
    const courses: StudySplitCourse[] = fixtures.map(raw => {
      const parsed = adapter.parseAssignments(raw.assignments);
      return {
        code: String(raw.course.course_code),
        assignments: parsed.map(assignment => ({ ...assignment, htmlUrl: 'https://canvas.example', descriptionHtml: '', submission: null })),
        input: {
          course: adapter.parseCourse(raw.course, 3),
          groups: adapter.parseAssignmentGroups(raw.assignment_groups),
          assignments: parsed,
          submissions: [],
          priorityWeight: 1,
        },
      };
    });
    const plan = allocateStudySplit(courses, 8, NOW);
    expect(plan.reduce((sum, item) => sum + item.hours, 0)).toBe(8);
    expect(plan.length).toBeGreaterThanOrEqual(5);
    expect(hoursOf(plan, 'Lecture Exam 1')).toBeGreaterThan(hoursOf(plan, 'Quiz 1: Biomolecules'));
    expect(Math.max(...plan.map(item => item.hours))).toBeGreaterThan(Math.min(...plan.map(item => item.hours)));
  });

  it('puts more hours on the sooner of two otherwise equal assignments', () => {
    const soon = live({ id: 'soon', name: 'Soon', groupId: '1', pointsPossible: 100, dueAt: '2026-11-10T23:59:00Z' });
    const later = live({ id: 'later', name: 'Later', groupId: '1', pointsPossible: 100, dueAt: '2026-12-01T23:59:00Z' });
    const plan = allocateStudySplit([course({ code: 'GEN', groups: [{ id: '1', name: 'Work' }], assignments: [soon, later] })], 8, NOW);
    expect(hoursOf(plan, 'Soon')).toBeGreaterThan(hoursOf(plan, 'Later'));
    expect(plan.reduce((sum, item) => sum + item.hours, 0)).toBe(8);
  });

  it('puts more hours on the assignment that is a larger share of the grade', () => {
    const heavy = live({ id: 'heavy', name: 'Heavy', groupId: '1', pointsPossible: 100, dueAt: '2026-11-12T23:59:00Z' });
    const light = live({ id: 'light', name: 'Light', groupId: '2', pointsPossible: 100, dueAt: '2026-11-12T23:59:00Z' });
    const plan = allocateStudySplit([course({
      code: 'GEN',
      weights: true,
      groups: [{ id: '1', name: 'Exams', weight: 80 }, { id: '2', name: 'Quizzes', weight: 10 }],
      assignments: [heavy, light],
    })], 8, NOW);
    expect(hoursOf(plan, 'Heavy')).toBeGreaterThan(hoursOf(plan, 'Light'));
  });

  it('does not schedule graded or past-due work', () => {
    const graded = live({ id: 'done', name: 'Done', groupId: '1', pointsPossible: 100, dueAt: '2026-11-10T23:59:00Z' }, {
      assignmentId: 'done', score: 90, posted: true, excused: false, missing: false, late: false, workflowState: 'graded',
    });
    const overdue = live({ id: 'overdue', name: 'Overdue', groupId: '1', pointsPossible: 100, dueAt: '2026-11-01T23:59:00Z' });
    const open = live({ id: 'open', name: 'Open', groupId: '1', pointsPossible: 100, dueAt: '2026-11-12T23:59:00Z' });
    const plan = allocateStudySplit([course({ code: 'GEN', groups: [{ id: '1', name: 'Work' }], assignments: [graded, overdue, open] })], 8, NOW);
    expect(plan.map(item => item.name)).toEqual(['Open']);
  });
});
