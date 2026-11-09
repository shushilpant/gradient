/**
 * OffCanvas Effort Optimizer: Empirical Priors & Behavioral Assumptions
 * 
 * =========================================================================
 * ASSUMPTIONS FILE (Rule 5 & Rule 12)
 * All values below represent empirical baseline models of learning dynamics.
 * They are decision-support heuristics, NOT deterministic guarantees.
 * Every parameter is transparent, user-auditable, and editable via the Options UI.
 * =========================================================================
 * 
 * Model Dynamics:
 * 1. Diminishing-Returns Mastery Curve:
 *      mu(h) = cap * (1 - exp(-h / tau_effective))
 *    where:
 *      - cap: Asymptotic score fraction ceiling (e.g., 0.98 for HW, 0.92 for exams)
 *      - tau: Baseline hours time constant to achieve ~63.2% of cap
 * 
 * 2. Logged Hours Multiplicative Update:
 *    Prior hours logged by the student accelerate time-to-mastery (compressing tau):
 *      tau_effective = tau * tauScale * max(0.25, 1 / (1 + alphaLogged * loggedHours))
 *    where:
 *      - alphaLogged: Task-specific learning rate per hour logged
 *      - 0.25: Safety floor (logged hours cannot reduce tau below 25% of baseline)
 * 
 * 3. Testing Uncertainty Noise Model:
 *    Truncated Normal distribution:
 *      score_fraction = clamp(mu(h) + noiseSigma * Z, 0.0, 1.0)
 *    where Z ~ N(0, 1) generated deterministically using Common Random Numbers (CRN).
 *    When h = 0, score_fraction = 0 (unattempted work).
 */

export interface TaskTypePrior {
  taskType: string;
  cap: number;
  tau: number;
  noiseSigma: number;
  alphaLogged: number;
}

export const DEFAULT_TASK_PRIORS: Record<string, TaskTypePrior> = {
  homework: {
    taskType: 'homework',
    cap: 0.98,
    tau: 3.0,
    noiseSigma: 0.05,
    alphaLogged: 0.15,
  },
  problem_set: {
    taskType: 'problem_set',
    cap: 0.96,
    tau: 4.0,
    noiseSigma: 0.06,
    alphaLogged: 0.15,
  },
  essay: {
    taskType: 'essay',
    cap: 0.94,
    tau: 6.0,
    noiseSigma: 0.07,
    alphaLogged: 0.12,
  },
  exam: {
    taskType: 'exam',
    cap: 0.92,
    tau: 8.0,
    noiseSigma: 0.08,
    alphaLogged: 0.10,
  },
  quiz: {
    taskType: 'quiz',
    cap: 0.95,
    tau: 2.0,
    noiseSigma: 0.05,
    alphaLogged: 0.18,
  },
  project: {
    taskType: 'project',
    cap: 0.95,
    tau: 10.0,
    noiseSigma: 0.07,
    alphaLogged: 0.10,
  },
  default: {
    taskType: 'default',
    cap: 0.95,
    tau: 4.0,
    noiseSigma: 0.06,
    alphaLogged: 0.14,
  },
};

function namedTaskType(name: string): string | undefined {
  const words = name.replace(/_/g, ' ');
  if (/\bquiz(?:zes|\d+)?\b/i.test(words)) return 'quiz';
  if (/\b(?:exams?|examinations?|midterms?|tests?)\d*\b/i.test(words)) return 'exam';
  if (/\b(?:essays?|papers?|reports?|critiques?)\b/i.test(words)) return 'essay';
  if (/\b(?:projects?|proposals?|milestones?|presentations?)\b/i.test(words)) return 'project';
  if (/\b(?:problem[\s-]+sets?|pset(?:s|\d+)?)\b/i.test(words)) return 'problem_set';
  if (/\b(?:hw\d*|homework|labs?|laboratory|laboratories|exercises?)\b/i.test(words)) return 'homework';
  return undefined;
}

/** Prefer a specific title before falling back to Canvas's quiz type or group name. */
export function inferTaskType(
  assignmentName: string,
  submissionTypes?: readonly string[],
  groupName?: string
): string {
  return namedTaskType(assignmentName)
    ?? (submissionTypes?.includes('online_quiz') ? 'quiz' : namedTaskType(groupName ?? ''))
    ?? 'default';
}

/**
 * Compute effective tau incorporating prior logged hours and sensitivity scale.
 */
export function computeEffectiveTau(
  baseTau: number,
  loggedHours: number = 0,
  alphaLogged: number = 0.15,
  tauScale: number = 1.0
): number {
  const safeLogged = Math.max(0, loggedHours);
  const loggedMultiplier = Math.max(0.25, 1 / (1 + alphaLogged * safeLogged));
  return baseTau * tauScale * loggedMultiplier;
}

/**
 * Expected score fraction without noise.
 */
export function expectedScoreFraction(
  hours: number,
  cap: number,
  tauEffective: number
): number {
  if (hours <= 0) return 0;
  if (tauEffective <= 0) return cap;
  return cap * (1 - Math.exp(-hours / tauEffective));
}

