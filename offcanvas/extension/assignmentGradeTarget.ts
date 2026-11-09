import { currentGrade } from '../core/gradeModel.js';
import { DEFAULT_GRADING_SCHEME } from '../core/schema.js';
import type { CanvasCourseSnapshot, CanvasLiveAssignment } from './liveCanvas.js';

export function canTargetAssignmentGrade(assignment: CanvasLiveAssignment): boolean {
  return assignment.pointsPossible > 0 && !assignment.omitFromFinalGrade && !assignment.submission?.excused;
}

export function assignmentWhatIfGrade(course: CanvasCourseSnapshot, assignment: CanvasLiveAssignment, scorePercent: number): number | null {
  const submissions = course.input.submissions.filter(item => item.assignmentId !== assignment.id);
  submissions.push({
    assignmentId: assignment.id,
    score: assignment.pointsPossible * scorePercent / 100,
    posted: true,
    excused: false,
    missing: false,
    late: false,
    workflowState: 'graded',
  });
  return currentGrade({ ...course.input, submissions }).percentage;
}

export function assignmentTargetOptions(course: CanvasCourseSnapshot) {
  const { gradingScheme, gradingSchemeSource } = course.input.course;
  const usesDefaultScale = gradingSchemeSource === 'default' || gradingScheme.length === 0;
  const scheme = gradingScheme.length ? gradingScheme : DEFAULT_GRADING_SCHEME;
  const cutoffs = new Map([...scheme].sort((a, b) => b.minPct - a.minPct).map(item => [item.letter, item]));
  return { options: [...cutoffs.values()].sort((a, b) => b.minPct - a.minPct), usesDefaultScale };
}

type AssignmentTargetResult = { score: number } | { score: null; bestGrade: number | null };

/** Find the first score on the what-if slider that reaches the target. */
export function assignmentGradeTarget(course: CanvasCourseSnapshot, assignment: CanvasLiveAssignment, target: number): AssignmentTargetResult {
  let bestGrade: number | null = null;
  // Mixed drop rules can change which work counts as the score rises.
  for (let score = 0; score <= 100; score++) {
    const grade = assignmentWhatIfGrade(course, assignment, score);
    if (grade === null) continue;
    if (grade >= target) return { score };
    if (bestGrade === null || grade > bestGrade) bestGrade = grade;
  }
  return { score: null, bestGrade };
}
