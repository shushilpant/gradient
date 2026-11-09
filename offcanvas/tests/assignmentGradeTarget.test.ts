import { describe, expect, it } from 'vitest';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';
import { assignmentGradeTarget, assignmentTargetOptions, assignmentWhatIfGrade } from '../extension/assignmentGradeTarget.js';
import type { CanvasCourseSnapshot } from '../extension/liveCanvas.js';

const adapter = new CanvasAdapter();
const postedAt = '2026-11-09T12:00:00Z';

function snapshot(course: CanvasCourseSnapshot['input']['course'], rawGroups: unknown[], rawAssignments: unknown[], rawSubmissions: unknown[]): CanvasCourseSnapshot {
  const groups = adapter.parseAssignmentGroups(rawGroups);
  const assignments = adapter.parseAssignments(rawAssignments);
  const submissions = adapter.parseSubmissions(rawSubmissions);
  return {
    id: course.id, name: course.name, code: 'CS-101', url: '', syllabusHtml: '',
    input: { course, groups, assignments, submissions }, currentScore: null, finalScore: null,
    assignments: assignments.map(assignment => ({ ...assignment, htmlUrl: '', descriptionHtml: '',
      submission: submissions.find(item => item.assignmentId === assignment.id) ?? null,
    })),
    resources: [], announcements: [], calendarEvents: [], issues: [],
  };
}

describe('assignment grade target', () => {
  it('uses the same posted grades, weights and drop rules as the what-if score', () => {
    const course = snapshot(
      adapter.parseCourse({ id: 1, name: 'Algorithms', apply_assignment_group_weights: true }, 3),
      [{ id: 1, name: 'Homework', group_weight: 40, rules: { drop_lowest: 1 } }, { id: 2, name: 'Exams', group_weight: 60 }],
      [1, 1, 1, 2, 2].map((group, id) => ({ id, name: `Assignment ${id}`, assignment_group_id: group, points_possible: 100 })),
      [null, 80, 65, 80, 100].map((score, id) => ({ assignment_id: id, score, posted_at: id === 4 ? null : postedAt })),
    );
    const assignment = course.assignments[0]!;
    expect(assignmentWhatIfGrade(course, assignment, 94)).toBe(82.8);
    expect(assignmentWhatIfGrade(course, assignment, 95)).toBe(83);
    expect(assignmentGradeTarget(course, assignment, 83)).toEqual({ score: 95 });
    expect(assignmentGradeTarget(course, assignment, 85)).toEqual({ score: null, bestGrade: 84 });
    expect(assignmentGradeTarget(course, assignment, 77)).toEqual({ score: 0 });
  });

  it('finds a reachable target when a higher score would change the dropped assignments', () => {
    const course = snapshot(
      adapter.parseCourse({ id: 1, name: 'Mixed drops' }, 3),
      [{ id: 1, name: 'Homework', rules: { drop_lowest: 1, drop_highest: 1 } }],
      [50, 50, 40, 70, 60, 70].map((points, id) => ({ id, name: `Assignment ${id}`, assignment_group_id: 1, points_possible: points })),
      [null, 29, 38, 15, 54, 15].map((score, id) => ({ assignment_id: id, score, posted_at: postedAt })),
    );
    const assignment = course.assignments[0]!;
    expect(assignmentWhatIfGrade(course, assignment, 100)).toBe(61.82);
    expect(assignmentGradeTarget(course, assignment, 62)).toEqual({ score: 97 });
  });

  it('distinguishes a Canvas grade scale from the default scale', () => {
    const raw = { id: 1, name: 'Algorithms', grading_standard: [] };
    const fallback = snapshot(adapter.parseCourse(raw, 3), [], [], []);
    expect(assignmentTargetOptions(fallback).usesDefaultScale).toBe(true);
    const canvas = snapshot(adapter.parseCourse({ ...raw, grading_scheme: [{ name: 'B', value: 0.801 }] }, 3), [], [], []);
    expect(assignmentTargetOptions(canvas)).toEqual({ options: [{ letter: 'B', minPct: 80.1 }], usesDefaultScale: false });
  });
});
