/**
 * GRADIENT Pure TypeScript Effort Optimizer
 * 
 * Strictly PURE functions: zero DOM, zero network, fully deterministic given a seed.
 * 
 * Goal: Given upcoming assignments across courses and a study capacity of N hours,
 * recommend an hour allocation maximizing expected semester GPA (courses weighted by credit hours).
 * 
 * Model:
 * - S(h) = cap * (1 - exp(-h / tau_effective)) + noise (Truncated Normal clamped to [0, 1])
 * - Multiplicative logged hours update:
 *     tau_effective = tau * tauScale * max(0.25, 1 / (1 + alphaLogged * loggedHours))
 * - Monte Carlo evaluation (e.g. 1,000–2,000 samples) using Common Random Numbers (CRN)
 * - Greedy marginal allocation in 15 or 30 minute units (best marginal GPA gain per unit)
 * - Local-search refinement: 1-opt swap transfers between assignments
 * - Deadlines, min/max block per assignment, per-course priority weights, protect-mastery floor
 * - Outputs: Ranked recommendations with plain-sentence reasons, threshold alerts, and robustness checks (tau * 0.7, 1.3)
 */

import {
  type Course,
  type AssignmentGroup,
  type Assignment,
  type Submission,
} from './schema.js';
import {
  determineDroppedAssignments,
  getLetterGrade,
  getGradePoints,
  type GradedItem,
} from './grade.js';
import {
  DEFAULT_TASK_PRIORS,
  inferTaskType,
  computeEffectiveTau,
  expectedScoreFraction,
  type TaskTypePrior,
} from './optimiserPriors.js';

// Re-export priors and utilities
export * from './optimiserPriors.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CourseOptimizationInput {
  course: Course;
  groups: AssignmentGroup[];
  assignments: Assignment[];
  submissions: Submission[];
  priorityWeight?: number; // default 1.0
  loggedHours?: Record<string, number>; // assignmentId -> logged hours
  /** Optional study allowlist; excluded work still participates in grade math. */
  studyEligibleAssignmentIds?: string[];
}

export interface OptimizationOptions {
  capacityHours: number; // N hours total study capacity
  stepSizeHours?: number; // 0.25 (15 min) or 0.5 (30 min), default 0.5
  numSamples?: number; // Monte Carlo samples, default 1000
  seed?: number; // PRNG seed for determinism, default 42
  protectMastery?: boolean; // ensure baseline floor across all upcoming assignments
  masteryFloorHours?: number; // floor hours if protectMastery is true, default 0.5
  minHoursPerAssignment?: number; // minimum allocation if assigned hours, default 0
  maxHoursPerAssignment?: number; // maximum block per assignment, default 8.0
  currentTime?: string | Date; // ISO string or Date to enforce deadlines
  customPriors?: Record<string, Partial<TaskTypePrior>>;
  tauScale?: number; // used for robustness checks (e.g. 0.7 or 1.3)
  isRobustnessRun?: boolean; // prevent infinite recursion during robustness evaluation
}

export interface UpcomingAssignmentMeta {
  uniqueKey: string;
  assignmentId: string;
  assignmentName: string;
  courseId: string;
  courseName: string;
  groupId: string;
  groupName: string;
  pointsPossible: number;
  taskType: string;
  cap: number;
  tauEffective: number;
  noiseSigma: number;
  dueAt: string | null;
  isEligible: boolean;
  minHours: number;
  maxHours: number;
}

export interface AssignmentRecommendation {
  assignmentId: string;
  assignmentName: string;
  courseId: string;
  courseName: string;
  allocatedHours: number;
  expectedScorePct: number;
  expectedGradePointGain: number; // course grade-point gain
  marginalGainPerHour: number;
  reason: string; // one plain sentence
}

export interface ThresholdAlert {
  courseId: string;
  courseName: string;
  currentGradePct: number;
  currentLetter: string;
  nextLetter: string;
  targetPct: number;
  pointsNeeded: number;
  hoursToLikelyCross: number;
  probabilityOfCrossing: number;
  alertMessage: string;
}

export interface RobustnessCheck {
  confidence: 'high' | 'medium' | 'low';
  topAssignmentsMatch: boolean;
  details: string;
  perturbationResults: {
    fasterPace: { tauScale: 0.7; topAssignmentIds: string[]; expectedGpa: number };
    slowerPace: { tauScale: 1.3; topAssignmentIds: string[]; expectedGpa: number };
  };
}

export interface OptimizerResult {
  totalCapacityHours: number;
  allocatedHours: number;
  baselineExpectedGpa: number;
  optimizedExpectedGpa: number;
  expectedGpaGain: number;
  recommendations: AssignmentRecommendation[];
  thresholdAlerts: ThresholdAlert[];
  robustness: RobustnessCheck;
  metadata: {
    seed: number;
    numSamples: number;
    stepSizeHours: number;
    runtimeMs: number;
    assumptionsUsed: {
      priors: Record<string, TaskTypePrior>;
      loggedHoursMultiplier: string;
      noiseDistribution: string;
    };
  };
}

// ============================================================================
// Seedable Deterministic PRNG (Mulberry32 + Box-Muller)
// ============================================================================

export class SeededRandom {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  /** Uniform random float in [0, 1) */
  next(): number {
    let z = (this.state += 0x6d2b79f5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard Normal distribution N(0, 1) using Box-Muller transform */
  nextGaussian(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}

// ============================================================================
// Fast Internal Monte Carlo Evaluator for a Single Course
// ============================================================================

interface CourseEvalContext {
  course: Course;
  groups: AssignmentGroup[];
  creditHours: number;
  priorityWeight: number;
  fixedGroupItems: Map<string, GradedItem[]>; // groupId -> fixed items
  upcomingByGroup: Map<string, UpcomingAssignmentMeta[]>; // groupId -> upcoming items
  allUpcoming: UpcomingAssignmentMeta[];
}

/**
 * Pre-build fast evaluation context for each course to avoid redundant object parsing.
 */
function buildCourseEvalContext(
  input: CourseOptimizationInput,
  options: OptimizationOptions,
  tauScale: number = 1.0
): CourseEvalContext {
  const { course, groups, assignments, submissions } = input;
  const loggedHoursMap = input.loggedHours ?? {};
  const studyEligibleIds = input.studyEligibleAssignmentIds === undefined
    ? null
    : new Set(input.studyEligibleAssignmentIds);
  const creditHours = Math.max(0.5, course.creditHours ?? 3.0);
  const priorityWeight = Math.max(0.01, input.priorityWeight ?? 1.0);

  const subMap = new Map<string, Submission>(submissions.map((s) => [s.assignmentId, s]));
  const groupMap = new Map<string, AssignmentGroup>(groups.map((g) => [g.id, g]));

  const fixedGroupItems = new Map<string, GradedItem[]>();
  const upcomingByGroup = new Map<string, UpcomingAssignmentMeta[]>();

  for (const g of groups) {
    fixedGroupItems.set(g.id, []);
    upcomingByGroup.set(g.id, []);
  }

  const allUpcoming: UpcomingAssignmentMeta[] = [];

  const nowTime = options.currentTime ? new Date(options.currentTime).getTime() : null;

  for (const assign of assignments) {
    if (assign.omitFromFinalGrade) continue;

    const sub = subMap.get(assign.id);
    if (sub?.excused) continue;

    const group = groupMap.get(assign.groupId);
    if (!group) continue;

    const isNeverDrop = group.rules.neverDrop.includes(assign.id);

    // If already posted with a score, this assignment's score is fixed
    if (sub && sub.score !== null && sub.posted) {
      fixedGroupItems.get(group.id)!.push({
        assignmentId: assign.id,
        name: assign.name,
        score: sub.score,
        pointsPossible: assign.pointsPossible,
        isNeverDrop,
      });
      continue;
    }

    // Otherwise, it is an upcoming pending assignment
    const taskType = inferTaskType(assign.name, assign.submissionTypes, group.name);
    const basePrior = DEFAULT_TASK_PRIORS[taskType] ?? DEFAULT_TASK_PRIORS['default']!;
    const customPrior = options.customPriors?.[taskType];

    const cap = customPrior?.cap ?? basePrior.cap;
    const baseTau = customPrior?.tau ?? basePrior.tau;
    const noiseSigma = customPrior?.noiseSigma ?? basePrior.noiseSigma;
    const alphaLogged = customPrior?.alphaLogged ?? basePrior.alphaLogged;

    const logged = loggedHoursMap[assign.id] ?? 0;
    const tauEff = computeEffectiveTau(baseTau, logged, alphaLogged, tauScale);

    // Deadline check: if past deadline, 0 hours allowed
    let isPastDeadline = false;
    if (nowTime !== null && assign.dueAt) {
      const dueTime = new Date(assign.dueAt).getTime();
      if (dueTime <= nowTime) {
        isPastDeadline = true;
      }
    }

    const isStudyEligible = studyEligibleIds === null || studyEligibleIds.has(assign.id);
    const maxH = isPastDeadline || !isStudyEligible
      ? 0
      : Math.min(options.maxHoursPerAssignment ?? 8.0, 24.0);

    const meta: UpcomingAssignmentMeta = {
      uniqueKey: `${course.id}::${assign.id}`,
      assignmentId: assign.id,
      assignmentName: assign.name,
      courseId: course.id,
      courseName: course.name,
      groupId: group.id,
      groupName: group.name,
      pointsPossible: assign.pointsPossible,
      taskType,
      cap,
      tauEffective: tauEff,
      noiseSigma,
      dueAt: assign.dueAt ?? null,
      isEligible: !isPastDeadline && maxH > 0,
      minHours: options.minHoursPerAssignment ?? 0,
      maxHours: maxH,
    };

    upcomingByGroup.get(group.id)!.push(meta);
    allUpcoming.push(meta);
  }

  return {
    course,
    groups,
    creditHours,
    priorityWeight,
    fixedGroupItems,
    upcomingByGroup,
    allUpcoming,
  };
}

/**
 * Evaluates Course Grade Points and Percentages across M Monte Carlo samples for given hour allocations.
 */
/**
 * Evaluates Course Grade Points and Percentages across M Monte Carlo samples for given hour allocations.
 * Optimized for high performance (zero allocations for non-drop groups).
 */
function evaluateCourseMonteCarlo(
  ctx: CourseEvalContext,
  hoursMap: Map<string, number>,
  noiseMatrix: Map<string, Float64Array>,
  numSamples: number
): {
  expectedGpa: number;
  expectedPct: number;
  samplePercentages: Float64Array;
  sampleGpas: Float64Array;
} {
  const { course, groups, fixedGroupItems, upcomingByGroup } = ctx;
  const samplePercentages = new Float64Array(numSamples);
  const sampleGpas = new Float64Array(numSamples);

  let sumGpa = 0;
  let sumPct = 0;

  // Pre-prepare group data structures outside sample loop
  interface FastUpcoming {
    meta: UpcomingAssignmentMeta;
    mu: number;
    sigma: number;
    pts: number;
    h: number;
    zArray: Float64Array;
    isNeverDrop: boolean;
  }

  interface FastGroup {
    group: AssignmentGroup;
    hasDropRules: boolean;
    fixedEarned: number;
    fixedPossible: number;
    fixedItems: GradedItem[];
    upcoming: FastUpcoming[];
    upcomingPossibleSum: number;
  }

  const fastGroups: FastGroup[] = groups.map((g) => {
    const fixed = fixedGroupItems.get(g.id) ?? [];
    const upcomingList = upcomingByGroup.get(g.id) ?? [];

    const fixedEarned = fixed.reduce((acc, it) => acc + it.score, 0);
    const fixedPossible = fixed.reduce((acc, it) => acc + it.pointsPossible, 0);
    const hasDropRules = g.rules.dropLowest > 0 || g.rules.dropHighest > 0;

    let upcomingPossibleSum = 0;
    const fastUpcoming: FastUpcoming[] = [];

    for (const it of upcomingList) {
      const h = hoursMap.get(it.uniqueKey) ?? 0;
      const mu = expectedScoreFraction(h, it.cap, it.tauEffective);
      const zArr = noiseMatrix.get(it.uniqueKey)!;
      const isNeverDrop = g.rules.neverDrop.includes(it.assignmentId);

      upcomingPossibleSum += it.pointsPossible;
      fastUpcoming.push({
        meta: it,
        mu,
        sigma: it.noiseSigma,
        pts: it.pointsPossible,
        h,
        zArray: zArr,
        isNeverDrop,
      });
    }

    return {
      group: g,
      hasDropRules,
      fixedEarned,
      fixedPossible,
      fixedItems: fixed,
      upcoming: fastUpcoming,
      upcomingPossibleSum,
    };
  });

  // Reusable array buffer for groups with drop rules
  const dropBuffer: GradedItem[] = [];

  // Evaluate across Monte Carlo samples
  for (let s = 0; s < numSamples; s++) {
    let grandEarned = 0;
    let grandPossible = 0;

    let weightedEarnedSum = 0;
    let activeWeightSum = 0;

    for (let gIdx = 0; gIdx < fastGroups.length; gIdx++) {
      const fg = fastGroups[gIdx]!;
      let groupEarned = 0;
      let groupPossible = 0;

      if (!fg.hasDropRules) {
        // Fast path: direct arithmetic, zero object allocations
        groupEarned = fg.fixedEarned;
        for (let uIdx = 0; uIdx < fg.upcoming.length; uIdx++) {
          const up = fg.upcoming[uIdx]!;
          if (up.h > 0) {
            const z = up.zArray[s]!;
            const frac = Math.min(1.0, Math.max(0.0, up.mu + up.sigma * z));
            groupEarned += frac * up.pts;
          }
        }
        groupPossible = fg.fixedPossible + fg.upcomingPossibleSum;
      } else {
        // Drop-rule path: populate buffer and evaluate drops
        dropBuffer.length = 0;
        for (let fIdx = 0; fIdx < fg.fixedItems.length; fIdx++) {
          dropBuffer.push(fg.fixedItems[fIdx]!);
        }

        for (let uIdx = 0; uIdx < fg.upcoming.length; uIdx++) {
          const up = fg.upcoming[uIdx]!;
          let score = 0;
          if (up.h > 0) {
            const z = up.zArray[s]!;
            const frac = Math.min(1.0, Math.max(0.0, up.mu + up.sigma * z));
            score = frac * up.pts;
          }
          dropBuffer.push({
            assignmentId: up.meta.assignmentId,
            name: up.meta.assignmentName,
            score,
            pointsPossible: up.pts,
            isNeverDrop: up.isNeverDrop,
          });
        }

        const { kept } = determineDroppedAssignments(dropBuffer, fg.group.rules);
        for (let k = 0; k < kept.length; k++) {
          groupEarned += kept[k]!.score;
          groupPossible += kept[k]!.pointsPossible;
        }
      }

      grandEarned += groupEarned;
      grandPossible += groupPossible;

      if (groupPossible > 0 && fg.group.weight > 0) {
        const groupPct = (groupEarned / groupPossible) * 100;
        weightedEarnedSum += groupPct * fg.group.weight;
        activeWeightSum += fg.group.weight;
      }
    }

    let finalPct = 0;
    if (course.applyGroupWeights) {
      finalPct = activeWeightSum > 0 ? weightedEarnedSum / activeWeightSum : 0;
    } else {
      finalPct = grandPossible > 0 ? (grandEarned / grandPossible) * 100 : 0;
    }

    samplePercentages[s] = finalPct;
    const letter = getLetterGrade(finalPct, course.gradingScheme);
    const gpa = getGradePoints(letter, course.gradePointScale);
    sampleGpas[s] = gpa;

    sumPct += finalPct;
    sumGpa += gpa;
  }

  return {
    expectedGpa: sumGpa / numSamples,
    expectedPct: sumPct / numSamples,
    samplePercentages,
    sampleGpas,
  };
}

// ============================================================================
// Main Optimization Engine: Greedy Marginal + 1-Opt Local Refinement
// ============================================================================

export function optimizeEffort(
  courseInputs: CourseOptimizationInput[],
  options: OptimizationOptions
): OptimizerResult {
  const startTime = performance.now();

  const capacity = Math.max(0, options.capacityHours);
  const stepSize = options.stepSizeHours ?? 0.5;
  const numSamples = options.numSamples ?? 1000;
  const seed = options.seed ?? 42;
  const tauScale = options.tauScale ?? 1.0;

  // 1. Initialize PRNG and Common Random Numbers (CRN) matrix
  const rng = new SeededRandom(seed);

  // Build course contexts
  const courseContexts = courseInputs.map((input) =>
    buildCourseEvalContext(input, options, tauScale)
  );

  // Generate deterministic standard normal noise matrix Z[assignmentId][s]
  const noiseMatrix = new Map<string, Float64Array>();
  for (const ctx of courseContexts) {
    for (const assign of ctx.allUpcoming) {
      const arr = new Float64Array(numSamples);
      for (let s = 0; s < numSamples; s++) {
        arr[s] = rng.nextGaussian();
      }
      noiseMatrix.set(assign.uniqueKey, arr);
    }
  }

  // Calculate total course normalization weight W_c = (w_c * credits_c) / sum(w_k * credits_k)
  const totalWeightDenominator = courseContexts.reduce(
    (acc, ctx) => acc + ctx.priorityWeight * ctx.creditHours,
    0
  );

  const courseWeights = courseContexts.map(
    (ctx) => (ctx.priorityWeight * ctx.creditHours) / (totalWeightDenominator || 1)
  );

  // Map each uniqueKey to its parent course context index
  const assignmentToCourseIdx = new Map<string, number>();
  const allEligibleUpcoming: UpcomingAssignmentMeta[] = [];

  courseContexts.forEach((ctx, idx) => {
    for (const it of ctx.allUpcoming) {
      assignmentToCourseIdx.set(it.uniqueKey, idx);
      if (it.isEligible) {
        allEligibleUpcoming.push(it);
      }
    }
  });

  // 2. Track current hour allocations
  const currentHours = new Map<string, number>();
  for (const it of allEligibleUpcoming) {
    currentHours.set(it.uniqueKey, 0);
  }

  let remainingCapacity = capacity;

  // 3. Protect Mastery Pre-Allocation
  if (options.protectMastery && allEligibleUpcoming.length > 0) {
    const floorH = options.masteryFloorHours ?? 0.5;
    for (const it of allEligibleUpcoming) {
      if (remainingCapacity < floorH) break;
      const initialH = Math.min(floorH, it.maxHours);
      currentHours.set(it.uniqueKey, initialH);
      remainingCapacity -= initialH;
    }
  }

  // Cache course evaluation states
  const courseEvals = courseContexts.map((ctx) =>
    evaluateCourseMonteCarlo(ctx, currentHours, noiseMatrix, numSamples)
  );

  const baselineGpa = courseEvals.reduce(
    (acc, ev, idx) => acc + (courseWeights[idx] ?? 0) * ev.expectedGpa,
    0
  );

  // Helper to compute overall expected semester GPA
  const computeOverallSemesterGpa = (): number => {
    return courseEvals.reduce(
      (acc, ev, idx) => acc + (courseWeights[idx] ?? 0) * ev.expectedGpa,
      0
    );
  };

  // 4. Greedy Marginal Allocation in stepSize increments
  while (remainingCapacity >= stepSize - 1e-6) {
    let bestAssignment: UpcomingAssignmentMeta | null = null;
    let bestGpaGain = -Infinity;
    let bestPctGain = -Infinity;
    let bestNewCourseEval: ReturnType<typeof evaluateCourseMonteCarlo> | null = null;

    for (const it of allEligibleUpcoming) {
      const hCurr = currentHours.get(it.uniqueKey) ?? 0;
      if (hCurr + stepSize > it.maxHours + 1e-6) continue;

      const cIdx = assignmentToCourseIdx.get(it.uniqueKey)!;
      const ctx = courseContexts[cIdx]!;
      const prevEval = courseEvals[cIdx]!;
      const cWeight = courseWeights[cIdx] ?? 0;

      // Temporarily assign +stepSize
      currentHours.set(it.uniqueKey, hCurr + stepSize);
      const testEval = evaluateCourseMonteCarlo(ctx, currentHours, noiseMatrix, numSamples);
      currentHours.set(it.uniqueKey, hCurr); // revert

      const marginalGpaGain = cWeight * (testEval.expectedGpa - prevEval.expectedGpa);
      const marginalPctGain = cWeight * (testEval.expectedPct - prevEval.expectedPct);

      // Select assignment with maximum marginal GPA gain (tie-breaking with course-weighted % gain)
      if (
        marginalGpaGain > bestGpaGain + 1e-6 ||
        (Math.abs(marginalGpaGain - bestGpaGain) <= 1e-6 && marginalPctGain > bestPctGain)
      ) {
        bestGpaGain = marginalGpaGain;
        bestPctGain = marginalPctGain;
        bestAssignment = it;
        bestNewCourseEval = testEval;
      }
    }

    // If no candidate assignment can receive hours or make progress, terminate greedy loop
    if (!bestAssignment || !bestNewCourseEval || (bestGpaGain <= 0 && bestPctGain <= 0)) {
      break;
    }

    // Commit best marginal step
    const currH = currentHours.get(bestAssignment.uniqueKey) ?? 0;
    currentHours.set(bestAssignment.uniqueKey, currH + stepSize);
    remainingCapacity -= stepSize;

    const cIdx = assignmentToCourseIdx.get(bestAssignment.uniqueKey)!;
    courseEvals[cIdx] = bestNewCourseEval;
  }

  // 5. Local-Search Refinement: 1-Opt Swaps between Assignments
  let swapImproved = true;
  let swapIterations = 0;
  const maxSwapIterations = 40;

  while (swapImproved && swapIterations < maxSwapIterations) {
    swapImproved = false;
    swapIterations++;

    for (const donor of allEligibleUpcoming) {
      const hDonor = currentHours.get(donor.uniqueKey) ?? 0;
      if (hDonor < stepSize - 1e-6) continue;

      for (const recipient of allEligibleUpcoming) {
        if (donor.uniqueKey === recipient.uniqueKey) continue;

        const hRecip = currentHours.get(recipient.uniqueKey) ?? 0;
        if (hRecip + stepSize > recipient.maxHours + 1e-6) continue;

        const dIdx = assignmentToCourseIdx.get(donor.uniqueKey)!;
        const rIdx = assignmentToCourseIdx.get(recipient.uniqueKey)!;

        // Current GPA baseline
        const curGpa = computeOverallSemesterGpa();

        // Apply tentative swap
        currentHours.set(donor.uniqueKey, hDonor - stepSize);
        currentHours.set(recipient.uniqueKey, hRecip + stepSize);

        const dEvalNew = evaluateCourseMonteCarlo(
          courseContexts[dIdx]!,
          currentHours,
          noiseMatrix,
          numSamples
        );
        let rEvalNew = dEvalNew;
        if (dIdx !== rIdx) {
          rEvalNew = evaluateCourseMonteCarlo(
            courseContexts[rIdx]!,
            currentHours,
            noiseMatrix,
            numSamples
          );
        }

        // Compute proposed GPA
        let proposedGpa = 0;
        for (let i = 0; i < courseContexts.length; i++) {
          const w = courseWeights[i] ?? 0;
          if (i === dIdx) proposedGpa += w * dEvalNew.expectedGpa;
          else if (i === rIdx) proposedGpa += w * rEvalNew.expectedGpa;
          else proposedGpa += w * courseEvals[i]!.expectedGpa;
        }

        if (proposedGpa > curGpa + 1e-5) {
          // Accept swap
          courseEvals[dIdx] = dEvalNew;
          courseEvals[rIdx] = rEvalNew;
          swapImproved = true;
          break;
        } else {
          // Revert swap
          currentHours.set(donor.uniqueKey, hDonor);
          currentHours.set(recipient.uniqueKey, hRecip);
        }
      }
      if (swapImproved) break;
    }
  }

  // 6. Final Evaluation
  const finalGpa = computeOverallSemesterGpa();
  const totalAllocated = capacity - remainingCapacity;

  // 7. Generate Ranked Recommendations with Plain-Sentence Reasons
  const recommendations: AssignmentRecommendation[] = [];

  for (const it of allEligibleUpcoming) {
    const hours = currentHours.get(it.uniqueKey) ?? 0;
    if (hours <= 0) continue;

    const cIdx = assignmentToCourseIdx.get(it.uniqueKey)!;
    const ctx = courseContexts[cIdx]!;

    // Expected score % on this assignment
    const scoreFrac = expectedScoreFraction(hours, it.cap, it.tauEffective);
    const scorePct = Math.round(scoreFrac * 1000) / 10;

    // Course Grade Point Gain attributable to this assignment
    const withoutItHours = new Map(currentHours);
    withoutItHours.set(it.uniqueKey, 0);
    const baseCEval = evaluateCourseMonteCarlo(
      ctx,
      withoutItHours,
      noiseMatrix,
      numSamples
    );
    const finalCEval = courseEvals[cIdx]!;
    const cGain = Math.max(0, finalCEval.expectedGpa - baseCEval.expectedGpa);

    // Marginal gain per hour
    const marginalGpa = hours > 0 ? cGain / hours : 0;

    // Build plain-sentence reason
    const baseLetter = getLetterGrade(baseCEval.expectedPct, ctx.course.gradingScheme);
    const optLetter = getLetterGrade(finalCEval.expectedPct, ctx.course.gradingScheme);

    let reason = '';
    if (baseLetter !== optLetter && cGain > 0.01) {
      reason = `Allocating ${hours.toFixed(1)}h elevates ${ctx.course.name.split(':')[0]} from a ${baseLetter} (${baseCEval.expectedPct.toFixed(1)}%) to ${optLetter} (${finalCEval.expectedPct.toFixed(1)}%), achieving a +${cGain.toFixed(2)} course grade-point increase.`;
    } else if (it.groupName.toLowerCase().includes('homework') || it.groupName.toLowerCase().includes('quiz')) {
      reason = `Allocating ${hours.toFixed(1)}h secures ${it.assignmentName} at ~${scorePct}%, protecting your ${it.groupName} group against drop-rule score penalties.`;
    } else {
      reason = `Allocating ${hours.toFixed(1)}h targets ~${scorePct}% on ${it.assignmentName} to buffer ${ctx.course.name.split(':')[0]} against test-day variance.`;
    }

    recommendations.push({
      assignmentId: it.assignmentId,
      assignmentName: it.assignmentName,
      courseId: it.courseId,
      courseName: it.courseName,
      allocatedHours: hours,
      expectedScorePct: scorePct,
      expectedGradePointGain: Math.round(cGain * 100) / 100,
      marginalGainPerHour: Math.round(marginalGpa * 1000) / 1000,
      reason,
    });
  }

  // Sort recommendations descending by allocated hours
  recommendations.sort((a, b) => b.allocatedHours - a.allocatedHours);

  // 8. Generate Threshold Alerts
  const thresholdAlerts: ThresholdAlert[] = [];

  for (let i = 0; i < courseContexts.length; i++) {
    const ctx = courseContexts[i]!;
    const ev = courseEvals[i]!;
    const curPct = ev.expectedPct;
    const curLetter = getLetterGrade(curPct, ctx.course.gradingScheme);

    // Find next higher letter grade threshold
    const sortedScheme = [...ctx.course.gradingScheme].sort((a, b) => b.minPct - a.minPct);
    const curIdx = sortedScheme.findIndex((s) => s.letter === curLetter);

    if (curIdx > 0) {
      const nextThreshold = sortedScheme[curIdx - 1]!;
      const targetPct = nextThreshold.minPct;
      const pointsNeeded = Math.max(0, targetPct - curPct);

      // Count probability of crossing in Monte Carlo distribution
      let crossingSamples = 0;
      for (let s = 0; s < numSamples; s++) {
        if (ev.samplePercentages[s]! >= targetPct) {
          crossingSamples++;
        }
      }
      const prob = crossingSamples / numSamples;

      // Hours allocated to upcoming assignments in this course
      const courseUpcoming = ctx.allUpcoming.filter((a) => a.isEligible);
      const allocatedInCourse = courseUpcoming.reduce(
        (acc, a) => acc + (currentHours.get(a.uniqueKey) ?? 0),
        0
      );

      const shortCourseName = ctx.course.name.split(':')[0] ?? ctx.course.name;
      const alertMessage = `${shortCourseName} is ${pointsNeeded.toFixed(2)} points under a ${nextThreshold.letter} (${targetPct.toFixed(1)}%); ${allocatedInCourse.toFixed(1)} hours likely crosses it (${Math.round(prob * 100)}% probability).`;

      thresholdAlerts.push({
        courseId: ctx.course.id,
        courseName: ctx.course.name,
        currentGradePct: Math.round(curPct * 100) / 100,
        currentLetter: curLetter,
        nextLetter: nextThreshold.letter,
        targetPct,
        pointsNeeded: Math.round(pointsNeeded * 100) / 100,
        hoursToLikelyCross: allocatedInCourse,
        probabilityOfCrossing: Math.round(prob * 100) / 100,
        alertMessage,
      });
    }
  }

  // 9. Robustness Check (tau scaled by 0.7 and 1.3)
  let robustness: RobustnessCheck;
  if (!options.isRobustnessRun) {
    robustness = computeRobustnessCheck(courseInputs, options, recommendations);
  } else {
    robustness = {
      confidence: 'high',
      topAssignmentsMatch: true,
      details: 'Internal perturbation run',
      perturbationResults: {
        fasterPace: { tauScale: 0.7, topAssignmentIds: [], expectedGpa: finalGpa },
        slowerPace: { tauScale: 1.3, topAssignmentIds: [], expectedGpa: finalGpa },
      },
    };
  }

  const runtimeMs = Math.round(performance.now() - startTime);

  return {
    totalCapacityHours: capacity,
    allocatedHours: Math.round(totalAllocated * 10) / 10,
    baselineExpectedGpa: Math.round(baselineGpa * 100) / 100,
    optimizedExpectedGpa: Math.round(finalGpa * 100) / 100,
    expectedGpaGain: Math.round((finalGpa - baselineGpa) * 100) / 100,
    recommendations,
    thresholdAlerts,
    robustness,
    metadata: {
      seed,
      numSamples,
      stepSizeHours: stepSize,
      runtimeMs,
      assumptionsUsed: {
        priors: DEFAULT_TASK_PRIORS,
        loggedHoursMultiplier: 'tau_effective = tau * max(0.25, 1 / (1 + 0.15 * loggedHours))',
        noiseDistribution: 'Truncated Normal N(0, sigma^2) clamped to [0, 1] via Box-Muller CRN',
      },
    },
  };
}

/**
 * Runs sensitivity perturbation on tau (0.7x faster pace, 1.3x slower pace)
 * and assesses stability of top recommended assignments.
 */
function computeRobustnessCheck(
  courseInputs: CourseOptimizationInput[],
  baseOptions: OptimizationOptions,
  baseRecommendations: AssignmentRecommendation[]
): RobustnessCheck {
  // Extract top assignments from base recommendation (e.g. top 2)
  const baseTopIds = baseRecommendations.slice(0, 2).map((r) => r.assignmentId);

  // Run with tauScale = 0.7 (Faster Pace / Optimistic)
  const optFaster = optimizeEffort(courseInputs, {
    ...baseOptions,
    tauScale: 0.7,
    isRobustnessRun: true,
    // Use slightly fewer samples for perturbation speed
    numSamples: Math.min(baseOptions.numSamples ?? 1000, 500),
  });
  const fastTopIds = optFaster.recommendations.slice(0, 2).map((r) => r.assignmentId);

  // Run with tauScale = 1.3 (Slower Pace / Pessimistic)
  const optSlower = optimizeEffort(courseInputs, {
    ...baseOptions,
    tauScale: 1.3,
    isRobustnessRun: true,
    numSamples: Math.min(baseOptions.numSamples ?? 1000, 500),
  });
  const slowTopIds = optSlower.recommendations.slice(0, 2).map((r) => r.assignmentId);

  // Compare sets
  const fastTopMatches = baseTopIds.length === 0 || baseTopIds[0] === fastTopIds[0];
  const slowTopMatches = baseTopIds.length === 0 || baseTopIds[0] === slowTopIds[0];

  let confidence: 'high' | 'medium' | 'low';
  let details: string;

  if (fastTopMatches && slowTopMatches) {
    confidence = 'high';
    details =
      'High confidence: Top priority assignments remain identical even if individual study pace is 30% faster or slower than assumed.';
  } else if (fastTopMatches || slowTopMatches) {
    confidence = 'medium';
    details =
      'Medium confidence: Top assignment recommendation is moderately sensitive to study pace variations.';
  } else {
    confidence = 'low';
    details =
      'Low confidence: Prioritized coursework shifts significantly under varying learning speed assumptions.';
  }

  return {
    confidence,
    topAssignmentsMatch: fastTopMatches && slowTopMatches,
    details,
    perturbationResults: {
      fasterPace: {
        tauScale: 0.7,
        topAssignmentIds: fastTopIds,
        expectedGpa: optFaster.optimizedExpectedGpa,
      },
      slowerPace: {
        tauScale: 1.3,
        topAssignmentIds: slowTopIds,
        expectedGpa: optSlower.optimizedExpectedGpa,
      },
    },
  };
}
