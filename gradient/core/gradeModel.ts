/**
 * GRADIENT Pure TypeScript Grade Model
 * 
 * Strictly PURE functions: zero DOM, zero network, fully deterministic.
 * Reproduces Canvas LMS gradebook calculations exactly from the Neutral Internal Schema:
 * - Weighted groups (applyGroupWeights) & unweighted total-points mode
 * - drop-lowest, drop-highest, and never-drop rules inside an assignment group
 * - Excused items excluded from calculations
 * - Missing items handled per Canvas specification
 * - Unposted/hidden scores handled per Canvas "current" vs "final" scores
 * - currentGrade(courseData) and finalGrade(courseData)
 * - neededScoreForTarget(courseData, targetPct, targetAssignmentId?)
 * - bestCase(courseData) and worstCase(courseData)
 * - Letter grade & GPA scale lookups
 */

import {
  type Course,
  type AssignmentGroup,
  type Assignment,
  type Submission,
} from './schema.js';

import {
  computeCanvasGrade,
  determineDroppedAssignments,
  getLetterGrade,
  getGradePoints,
  type ComputedGradeResult,
  type GradeCalculationOptions,
} from './grade.js';

export {
  computeCanvasGrade,
  determineDroppedAssignments,
  getLetterGrade,
  getGradePoints,
  type ComputedGradeResult,
  type GradeCalculationOptions,
};

export interface CourseData {
  course: Course;
  groups: AssignmentGroup[];
  assignments: Assignment[];
  submissions: Submission[];
}

export interface NeededScoreResult {
  targetPercentage: number;
  targetAssignmentId: string | null;
  targetAssignmentName: string | null;
  pointsPossible: number;
  neededScore: number;
  neededPercentage: number;
  isAchievable: boolean;
  currentPercentage: number;
  reason?: string;
}

/**
 * Canvas "Current Grade": Calculates overall grade based STRICTLY on graded assignments.
 * Unsubmitted, ungraded, and unposted scores are omitted.
 * Group weights are normalized across active graded groups.
 */
export function currentGrade(
  courseData: CourseData,
  options?: Partial<GradeCalculationOptions>
): ComputedGradeResult {
  return computeCanvasGrade(
    courseData.course,
    courseData.groups,
    courseData.assignments,
    courseData.submissions,
    {
      treatUnsubmittedAsZero: false,
      includeUnposted: false,
      roundingDecimals: 2,
      ...options,
    }
  );
}

/**
 * Canvas "Final Grade": Treats all unsubmitted and ungraded assignments as 0 points.
 * Excused assignments remain excluded.
 * Unposted scores in student view count as 0.
 */
export function finalGrade(
  courseData: CourseData,
  options?: Partial<GradeCalculationOptions>
): ComputedGradeResult {
  return computeCanvasGrade(
    courseData.course,
    courseData.groups,
    courseData.assignments,
    courseData.submissions,
    {
      treatUnsubmittedAsZero: true,
      includeUnposted: false,
      roundingDecimals: 2,
      ...options,
    }
  );
}

/**
 * Best Case Scenario: Assumes all remaining unsubmitted assignments receive 100% of points possible.
 * Evaluates drop rules dynamically under maximum future performance.
 */
export function bestCase(
  courseData: CourseData,
  options?: Partial<GradeCalculationOptions>
): ComputedGradeResult {
  const submissionMap = new Map<string, Submission>();
  for (const s of courseData.submissions) {
    submissionMap.set(s.assignmentId, { ...s });
  }

  // Set 100% on all unsubmitted, non-excused assignments
  const simulatedSubmissions: Submission[] = courseData.assignments.map((a) => {
    const existing = submissionMap.get(a.id);
    if (a.omitFromFinalGrade || existing?.excused) {
      return (
        existing ?? {
          assignmentId: a.id,
          score: null,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'unsubmitted',
        }
      );
    }

    if (existing && existing.score !== null && existing.posted) {
      return existing;
    }

    // Unsubmitted or unposted -> 100%
    return {
      assignmentId: a.id,
      score: a.pointsPossible,
      excused: false,
      missing: false,
      late: false,
      posted: true,
      workflowState: 'graded',
    };
  });

  return computeCanvasGrade(
    courseData.course,
    courseData.groups,
    courseData.assignments,
    simulatedSubmissions,
    {
      treatUnsubmittedAsZero: false,
      includeUnposted: true,
      roundingDecimals: 2,
      ...options,
    }
  );
}

/**
 * Worst Case Scenario: Assumes all remaining unsubmitted assignments receive 0 points.
 * Evaluates drop rules dynamically (the 0 score may be dropped if dropLowest is available).
 */
export function worstCase(
  courseData: CourseData,
  options?: Partial<GradeCalculationOptions>
): ComputedGradeResult {
  const submissionMap = new Map<string, Submission>();
  for (const s of courseData.submissions) {
    submissionMap.set(s.assignmentId, { ...s });
  }

  const simulatedSubmissions: Submission[] = courseData.assignments.map((a) => {
    const existing = submissionMap.get(a.id);
    if (a.omitFromFinalGrade || existing?.excused) {
      return (
        existing ?? {
          assignmentId: a.id,
          score: null,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'unsubmitted',
        }
      );
    }

    if (existing && existing.score !== null && existing.posted) {
      return existing;
    }

    // Unsubmitted -> 0 points
    return {
      assignmentId: a.id,
      score: 0,
      excused: false,
      missing: false,
      late: false,
      posted: true,
      workflowState: 'graded',
    };
  });

  return computeCanvasGrade(
    courseData.course,
    courseData.groups,
    courseData.assignments,
    simulatedSubmissions,
    {
      treatUnsubmittedAsZero: false,
      includeUnposted: true,
      roundingDecimals: 2,
      ...options,
    }
  );
}

/**
 * Needed Score For Target:
 * Calculates the exact points and percentage needed on a target assignment
 * (or next pending assignment) to achieve targetPct overall course grade.
 * 
 * Uses monotonic bisection root search to handle non-linear drop rule shifts,
 * group weight normalizations, and tie-breakers exactly.
 */
export function neededScoreForTarget(
  courseData: CourseData,
  targetPct: number,
  targetAssignmentId?: string
): NeededScoreResult {
  const current = currentGrade(courseData);
  const currentPct = current.percentage ?? 0;

  // Identify candidate target assignment
  const submissionMap = new Map<string, Submission>();
  for (const s of courseData.submissions) {
    submissionMap.set(s.assignmentId, s);
  }

  let targetAssignment: Assignment | undefined;

  if (targetAssignmentId) {
    targetAssignment = courseData.assignments.find((a) => a.id === targetAssignmentId);
  } else {
    // Pick the first unsubmitted/pending assignment
    targetAssignment = courseData.assignments.find((a) => {
      if (a.omitFromFinalGrade) return false;
      const s = submissionMap.get(a.id);
      return !s || s.score === null || !s.posted;
    });
  }

  if (!targetAssignment) {
    // All work completed or no eligible assignments
    const isAchieved = currentPct >= targetPct;
    return {
      targetPercentage: targetPct,
      targetAssignmentId: null,
      targetAssignmentName: null,
      pointsPossible: 0,
      neededScore: 0,
      neededPercentage: 0,
      isAchievable: isAchieved,
      currentPercentage: currentPct,
      reason: isAchieved
        ? 'Target grade already achieved; all assignments are graded.'
        : 'Cannot reach target: all assignments are graded and final score is below target.',
    };
  }

  const pointsPossible = targetAssignment.pointsPossible;

  // Objective function: computes overall course percentage given test score s on target assignment
  const evalScore = (testScore: number): number => {
    const testSubs: Submission[] = courseData.assignments.map((a) => {
      if (a.id === targetAssignment!.id) {
        return {
          assignmentId: a.id,
          score: testScore,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'graded',
        };
      }
      const s = submissionMap.get(a.id);
      return (
        s ?? {
          assignmentId: a.id,
          score: null,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'unsubmitted',
        }
      );
    });

    const res = computeCanvasGrade(
      courseData.course,
      courseData.groups,
      courseData.assignments,
      testSubs,
      { treatUnsubmittedAsZero: false, includeUnposted: true, roundingDecimals: 4 }
    );
    return res.percentage ?? 0;
  };

  // Check if target is already achieved even with 0 on target assignment
  const scoreAtZero = evalScore(0);
  if (scoreAtZero >= targetPct) {
    return {
      targetPercentage: targetPct,
      targetAssignmentId: targetAssignment.id,
      targetAssignmentName: targetAssignment.name,
      pointsPossible,
      neededScore: 0,
      neededPercentage: 0,
      isAchievable: true,
      currentPercentage: currentPct,
      reason: 'Target is already guaranteed (0 points needed).',
    };
  }

  // Check if target is achievable with 100% (pointsPossible)
  const scoreAtMax = evalScore(pointsPossible);
  const isAchievableWithinNormalMax = scoreAtMax >= targetPct;

  // Bisection search between 0 and pointsPossible * 2 (allow extra credit analysis)
  let low = 0;
  let high = pointsPossible * 2;
  const tolerance = 1e-5;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (low + high) / 2;
    const evaluated = evalScore(mid);

    if (Math.abs(evaluated - targetPct) < tolerance) {
      low = mid;
      break;
    }

    if (evaluated < targetPct) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const neededScore = Math.round(low * 100) / 100;
  const neededPct = pointsPossible > 0 ? Math.round((neededScore / pointsPossible) * 10000) / 100 : 0;

  let reason: string | undefined;
  if (!isAchievableWithinNormalMax) {
    reason = `Requires ${neededPct}% (${neededScore}/${pointsPossible} pts) — extra credit required.`;
  } else {
    reason = `Need ${neededScore}/${pointsPossible} pts (${neededPct}%) on ${targetAssignment.name}.`;
  }

  return {
    targetPercentage: targetPct,
    targetAssignmentId: targetAssignment.id,
    targetAssignmentName: targetAssignment.name,
    pointsPossible,
    neededScore,
    neededPercentage: neededPct,
    isAchievable: isAchievableWithinNormalMax,
    currentPercentage: currentPct,
    reason,
  };
}
