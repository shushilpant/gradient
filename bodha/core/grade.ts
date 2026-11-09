import {
  type Course,
  type AssignmentGroup,
  type Assignment,
  type Submission,
  type GradingSchemeItem,
  type GradePointScale,
} from './schema.js';

export interface GradeCalculationOptions {
  /**
   * Whether to include unposted (hidden) grades.
   * Canvas default for students is false (unposted grades do not count toward current score).
   */
  includeUnposted?: boolean;

  /**
   * Whether to treat unsubmitted / ungraded assignments as zero.
   * Canvas "Calculate based only on graded assignments" checkbox:
   * - false (default): Only graded assignments count ("Current Grade").
   * - true: Ungraded assignments receive 0 ("Final Grade").
   */
  treatUnsubmittedAsZero?: boolean;

  /**
   * Rounding precision for percentage (default 2 decimals).
   */
  roundingDecimals?: number;
}

export interface GroupScoreBreakdown {
  groupId: string;
  groupName: string;
  weight: number;
  pointsEarned: number;
  pointsPossible: number;
  percentage: number | null;
  droppedAssignmentIds: string[];
  keptAssignmentIds: string[];
  assignmentCount: number;
  gradedCount: number;
}

export interface ComputedGradeResult {
  /** Total calculated percentage (0-100+) */
  percentage: number | null;
  /** Letter grade based on course grading scheme */
  letterGrade: string | null;
  /** GPA points on the course grade point scale */
  gradePoints: number | null;
  /** Total points earned across all counted assignments */
  totalPointsEarned: number;
  /** Total points possible across all counted assignments */
  totalPointsPossible: number;
  /** Group-by-group score breakdown */
  groups: GroupScoreBreakdown[];
  /** Dropped assignment IDs across all groups */
  droppedAssignmentIds: string[];
  /** Whether group weights were applied */
  groupWeightsApplied: boolean;
  /** Credit hours for GPA calculation */
  creditHours: number;
}

export interface GradedItem {
  assignmentId: string;
  name: string;
  score: number;
  pointsPossible: number;
  isNeverDrop: boolean;
}

/**
 * Given a list of eligible graded assignments in a group, determine which assignments
 * to drop according to Canvas dropLowest, dropHighest, and neverDrop rules.
 *
 * Canvas Rule: Canvas drops the assignment(s) that maximize the resulting group percentage:
 *   (sum of remaining scores) / (sum of remaining pointsPossible)
 * while respecting neverDrop assignments.
 *
 * If all assignments have equal points possible, dropping lowest score is equivalent
 * to dropping the lowest percentage. If points possible vary, Canvas evaluates which drop
 * maximizes the resulting fraction.
 */
export function determineDroppedAssignments(
  items: GradedItem[],
  rules: { dropLowest: number; dropHighest: number; neverDrop: string[] }
): { dropped: string[]; kept: GradedItem[] } {
  if (items.length === 0) {
    return { dropped: [], kept: [] };
  }

  const neverDropSet = new Set(rules.neverDrop);
  const droppableCandidates = items.filter(
    (item) => !item.isNeverDrop && !neverDropSet.has(item.assignmentId)
  );
  const lockedItems = items.filter(
    (item) => item.isNeverDrop || neverDropSet.has(item.assignmentId)
  );

  // If there are no droppable candidates or no drop rules, keep all
  if (droppableCandidates.length === 0 || (rules.dropLowest === 0 && rules.dropHighest === 0)) {
    return { dropped: [], kept: items };
  }

  // Current remaining pool of candidates
  let remainingCandidates = [...droppableCandidates];
  const droppedIds: string[] = [];

  // Drop highest first if requested (rare in Canvas, but supported)
  const dropHighestCount = Math.min(rules.dropHighest, remainingCandidates.length);
  for (let d = 0; d < dropHighestCount; d++) {
    if (remainingCandidates.length === 0) break;

    // Pick candidate whose removal MINIMIZES the group score (highest performance)
    let bestIndex = 0;
    let worstResultingRatio = Infinity;

    for (let i = 0; i < remainingCandidates.length; i++) {
      const testRemaining = [
        ...lockedItems,
        ...remainingCandidates.filter((_, idx) => idx !== i),
      ];
      const sumEarned = testRemaining.reduce((acc, it) => acc + it.score, 0);
      const sumPossible = testRemaining.reduce((acc, it) => acc + it.pointsPossible, 0);
      const ratio = sumPossible > 0 ? sumEarned / sumPossible : 0;

      if (ratio < worstResultingRatio) {
        worstResultingRatio = ratio;
        bestIndex = i;
      }
    }

    const removed = remainingCandidates.splice(bestIndex, 1)[0]!;
    droppedIds.push(removed.assignmentId);
  }

  // Drop lowest
  const dropLowestCount = Math.min(rules.dropLowest, remainingCandidates.length);
  for (let d = 0; d < dropLowestCount; d++) {
    if (remainingCandidates.length === 0) break;

    // Pick candidate whose removal MAXIMIZES the resulting group percentage
    let bestIndex = 0;
    let bestResultingRatio = -Infinity;

    for (let i = 0; i < remainingCandidates.length; i++) {
      const candidate = remainingCandidates[i]!;
      const testRemaining = [
        ...lockedItems,
        ...remainingCandidates.filter((_, idx) => idx !== i),
      ];
      const sumEarned = testRemaining.reduce((acc, it) => acc + it.score, 0);
      const sumPossible = testRemaining.reduce((acc, it) => acc + it.pointsPossible, 0);
      const ratio = sumPossible > 0 ? sumEarned / sumPossible : 1.0;

      if (ratio > bestResultingRatio) {
        bestResultingRatio = ratio;
        bestIndex = i;
      } else if (ratio === bestResultingRatio) {
        // Tie-breaker: Drop the one with higher pointsPossible (higher weight impact)
        const currentBest = remainingCandidates[bestIndex]!;
        if (candidate.pointsPossible > currentBest.pointsPossible) {
          bestIndex = i;
        }
      }
    }

    const removed = remainingCandidates.splice(bestIndex, 1)[0]!;
    droppedIds.push(removed.assignmentId);
  }

  const kept = [...lockedItems, ...remainingCandidates];
  return { dropped: droppedIds, kept };
}

/**
 * Pure function: Match percentage to letter grade using course grading scheme.
 */
export function getLetterGrade(percentage: number, scheme: readonly GradingSchemeItem[]): string {
  // Sort scheme descending by minPct
  const sortedScheme = [...scheme].sort((a, b) => b.minPct - a.minPct);
  for (const item of sortedScheme) {
    if (percentage >= item.minPct) {
      return item.letter;
    }
  }
  return sortedScheme[sortedScheme.length - 1]?.letter ?? 'F';
}

/**
 * Pure function: Match letter grade to grade points.
 */
export function getGradePoints(letter: string, scale: GradePointScale): number {
  return scale[letter] ?? 0.0;
}

/**
 * Main Pure Grade Calculator: Reproduces Canvas LMS grading logic exactly.
 */
export function computeCanvasGrade(
  course: Course,
  groups: AssignmentGroup[],
  assignments: Assignment[],
  submissions: Submission[],
  options: GradeCalculationOptions = {}
): ComputedGradeResult {
  const {
    includeUnposted = false,
    treatUnsubmittedAsZero = false,
    roundingDecimals = 2,
  } = options;

  // Build lookup maps
  const submissionMap = new Map<string, Submission>();
  for (const sub of submissions) {
    submissionMap.set(sub.assignmentId, sub);
  }

  const assignmentMap = new Map<string, Assignment>();
  for (const assign of assignments) {
    assignmentMap.set(assign.id, assign);
  }

  const groupBreakdowns: GroupScoreBreakdown[] = [];
  const allDroppedAssignmentIds: string[] = [];

  let grandTotalEarned = 0;
  let grandTotalPossible = 0;

  // Process each Assignment Group
  for (const group of groups) {
    const groupAssignments = assignments.filter((a) => a.groupId === group.id);
    const gradedItems: GradedItem[] = [];

    for (const assign of groupAssignments) {
      // Rule: omitFromFinalGrade assignments are excluded completely
      if (assign.omitFromFinalGrade) {
        continue;
      }

      const sub = submissionMap.get(assign.id);

      // Check if excused
      if (sub?.excused) {
        continue;
      }

      // Check posting policy
      let score: number | null = null;
      if (sub && !sub.posted && !includeUnposted) {
        if (treatUnsubmittedAsZero) {
          // In Canvas final score, unposted assignments are treated as unsubmitted (0 points)
          score = 0;
        } else {
          // In Canvas current score, unposted assignments are excluded
          continue;
        }
      }

      if (score === null) {
        if (sub && sub.score !== null) {
          score = sub.score;
        } else if (treatUnsubmittedAsZero) {
          score = 0;
        }
      }

      // If we have a score, include in graded items
      if (score !== null) {
        const isNeverDrop = group.rules.neverDrop.includes(assign.id);
        gradedItems.push({
          assignmentId: assign.id,
          name: assign.name,
          score,
          pointsPossible: assign.pointsPossible,
          isNeverDrop,
        });
      }
    }

    // Apply drop rules for this group
    const { dropped, kept } = determineDroppedAssignments(gradedItems, group.rules);
    allDroppedAssignmentIds.push(...dropped);

    const pointsEarned = kept.reduce((acc, it) => acc + it.score, 0);
    const pointsPossible = kept.reduce((acc, it) => acc + it.pointsPossible, 0);
    const percentage = pointsPossible > 0 ? (pointsEarned / pointsPossible) * 100 : null;

    grandTotalEarned += pointsEarned;
    grandTotalPossible += pointsPossible;

    groupBreakdowns.push({
      groupId: group.id,
      groupName: group.name,
      weight: group.weight,
      pointsEarned,
      pointsPossible,
      percentage,
      droppedAssignmentIds: dropped,
      keptAssignmentIds: kept.map((it) => it.assignmentId),
      assignmentCount: groupAssignments.length,
      gradedCount: gradedItems.length,
    });
  }

  // Calculate overall course percentage
  let finalPercentage: number | null = null;

  if (course.applyGroupWeights) {
    // Weighted groups
    // In Canvas: Only groups with graded assignments contribute to the weighted sum.
    // The final score is divided by the sum of weights of active groups.
    let weightedEarnedSum = 0;
    let activeWeightTotal = 0;

    for (const bg of groupBreakdowns) {
      if (bg.percentage !== null) {
        weightedEarnedSum += (bg.percentage * bg.weight) / 100;
        activeWeightTotal += bg.weight;
      } else if (bg.pointsPossible === 0 && bg.pointsEarned > 0) {
        // Extra credit group with 0 points possible
        weightedEarnedSum += bg.pointsEarned;
      }
    }

    if (activeWeightTotal > 0) {
      finalPercentage = (weightedEarnedSum / (activeWeightTotal / 100));
    }
  } else {
    // Unweighted (Points-based)
    if (grandTotalPossible > 0) {
      finalPercentage = (grandTotalEarned / grandTotalPossible) * 100;
    }
  }

  // Apply rounding if percentage exists
  if (finalPercentage !== null) {
    const factor = Math.pow(10, roundingDecimals);
    finalPercentage = Math.round(finalPercentage * factor) / factor;
  }

  // Determine letter grade and GPA points
  const letterGrade =
    finalPercentage !== null ? getLetterGrade(finalPercentage, course.gradingScheme) : null;
  const gradePoints =
    letterGrade !== null ? getGradePoints(letterGrade, course.gradePointScale) : null;

  return {
    percentage: finalPercentage,
    letterGrade,
    gradePoints,
    totalPointsEarned: Math.round(grandTotalEarned * 100) / 100,
    totalPointsPossible: Math.round(grandTotalPossible * 100) / 100,
    groups: groupBreakdowns,
    droppedAssignmentIds: allDroppedAssignmentIds,
    groupWeightsApplied: course.applyGroupWeights,
    creditHours: course.creditHours,
  };
}
