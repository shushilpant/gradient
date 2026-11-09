import { finalGrade } from '../core/gradeModel.js';
import type { CanvasCourseSnapshot, CanvasLiveAssignment } from './liveCanvas.js';
import { dueTime, isPending } from './plainLanguage.js';

export interface PrioritizedAssignment {
  course: CanvasCourseSnapshot;
  assignment: CanvasLiveAssignment;
  gradeImpact: number | null;
  deadline: number;
}

const HOUR_MS = 60 * 60 * 1000;
const GRADE_PRECISION = 8;

function compareGradeImpact(a: PrioritizedAssignment, b: PrioritizedAssignment): number {
  return (b.gradeImpact ?? -1) - (a.gradeImpact ?? -1) || a.deadline - b.deadline;
}

/** Rank dated outstanding work by the modeled gain from full credit, holding other grades fixed. */
export function getAssignmentPriorities(courses: CanvasCourseSnapshot[]): PrioritizedAssignment[] {
  const priorities = courses.flatMap(course => {
    const tasks = course.assignments.filter(assignment => !assignment.lockedForUser && isPending(assignment))
      .map(assignment => ({ assignment, deadline: dueTime(assignment) }))
      .filter(task => Number.isFinite(task.deadline));
    if (!tasks.length) return [];

    const input = course.input;
    const groupIds = new Set(input.groups.map(group => group.id));
    const baseline = finalGrade(input, { roundingDecimals: GRADE_PRECISION }).percentage;

    return tasks.map(({ assignment, deadline }) => {
      let gradeImpact: number | null = null;
      if (assignment.omitFromFinalGrade || assignment.pointsPossible === 0) {
        gradeImpact = 0;
      } else if (baseline !== null && groupIds.has(assignment.groupId)) {
        const submissions = input.submissions.filter(submission => submission.assignmentId !== assignment.id);
        submissions.push({
          assignmentId: assignment.id,
          score: assignment.pointsPossible,
          posted: true,
          excused: false,
          missing: false,
          late: false,
          workflowState: 'graded',
        });
        const withFullCredit = finalGrade({ ...input, submissions }, { roundingDecimals: GRADE_PRECISION }).percentage;
        if (withFullCredit !== null) {
          gradeImpact = Math.max(0, Number((withFullCredit - baseline).toFixed(GRADE_PRECISION)));
        }
      }
      return { course, assignment, gradeImpact, deadline };
    });
  });

  return priorities.sort(compareGradeImpact);
}

function deadlineBand(remainingMs: number): number {
  if (remainingMs <= 2 * HOUR_MS) return 0;
  return remainingMs <= 24 * HOUR_MS ? 1 : 2;
}

/** Focus on deadlines within two hours first, then within a day, then later work. */
export function rankDeadlinePriorities(priorities: PrioritizedAssignment[], now: number): PrioritizedAssignment[] {
  return priorities.filter(task => task.deadline > now)
    .sort((a, b) => deadlineBand(a.deadline - now) - deadlineBand(b.deadline - now) || compareGradeImpact(a, b));
}
