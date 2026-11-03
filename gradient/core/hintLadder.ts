import {
  type LadderRungId,
  type LadderRung,
  type HintLadderSession,
  type ProblemDomain,
} from './hintLadderSchema.js';

export const MIN_FRICTION_CHARS = 15;

/**
 * Validates whether the student has satisfied the friction rule
 * by articulating what they have tried before accessing R3 or R4.
 */
export function isFrictionSatisfied(studentAttempt?: string): boolean {
  if (!studentAttempt) return false;
  const trimmed = studentAttempt.trim();
  if (trimmed.length < MIN_FRICTION_CHARS) return false;

  // Check for trivial repetitive characters (e.g. "aaaaaaa...")
  const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s+/g, ''));
  if (uniqueChars.size < 4) return false;

  return true;
}

/**
 * Checks for adversarial jailbreaks or direct answer requests.
 */
export function isAdversarialAnswerExtraction(prompt: string): boolean {
  const lowered = prompt.toLowerCase();
  const JAILBREAK_PATTERNS = [
    /\b(just\s+give\s+me|tell\s+me)\s+(the\s+)?(final\s+)?(answer|solution)\b/i,
    /\b(what\s+is\s+the\s+answer|show\s+the\s+full\s+solution\s+to\s+my\s+exact\s+problem)\b/i,
    /\b(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override)\b/i,
    /\b(print\s+the\s+(answer|solution)\s+key|give\s+me\s+the\s+code\s+directly)\b/i,
    /\b(solve\s+this\s+for\s+me\s+completely|write\s+the\s+essay\s+for\s+me)\b/i,
  ];

  return JAILBREAK_PATTERNS.some((pat) => pat.test(lowered));
}

/**
 * Creates an initial HintLadderSession for an assignment or problem.
 */
export function createHintLadderSession(params: {
  assignmentId: string;
  courseId: string;
  problemText: string;
  domain?: ProblemDomain;
  studentAttempt?: string;
}): HintLadderSession {
  const domain = params.domain ?? 'math_symbolic';
  const frictionSatisfied = isFrictionSatisfied(params.studentAttempt);

  const rungs: Record<LadderRungId, LadderRung> = {
    R0: {
      rungId: 'R0',
      title: 'R0: Task Restatement & Core Concepts',
      content: '',
      isUnlocked: true,
      requiresFrictionInput: false,
      frictionProvided: true,
      verificationStatus: 'verified',
      leakCheckPassed: true,
    },
    R1: {
      rungId: 'R1',
      title: 'R1: Socratic Nudge',
      content: '',
      isUnlocked: false,
      requiresFrictionInput: false,
      frictionProvided: true,
      verificationStatus: 'verified',
      leakCheckPassed: true,
    },
    R2: {
      rungId: 'R2',
      title: 'R2: Name the Technique',
      content: '',
      isUnlocked: false,
      requiresFrictionInput: false,
      frictionProvided: true,
      verificationStatus: 'verified',
      leakCheckPassed: true,
    },
    R3: {
      rungId: 'R3',
      title: 'R3: Worked Example on Similar Problem (Isomorphic Variant)',
      content: '',
      isUnlocked: false,
      requiresFrictionInput: true,
      frictionProvided: frictionSatisfied,
      verificationStatus: domain === 'essay_conceptual' ? 'weaker_heuristic' : 'verified',
      leakCheckPassed: true,
    },
    R4: {
      rungId: 'R4',
      title: 'R4: Check-My-Work Reasoning Critique',
      content: '',
      isUnlocked: false,
      requiresFrictionInput: true,
      frictionProvided: frictionSatisfied,
      verificationStatus: domain === 'essay_conceptual' ? 'weaker_heuristic' : 'verified',
      leakCheckPassed: true,
    },
  };

  return {
    assignmentId: params.assignmentId,
    courseId: params.courseId,
    problemText: params.problemText,
    domain,
    currentRung: 'R0',
    rungs,
    studentAttemptText: params.studentAttempt,
    frictionSatisfied,
    isLeakDetected: false,
  };
}

/**
 * Transitions the hint ladder to a target rung respecting the friction invariant.
 */
export function advanceLadderRung(
  session: HintLadderSession,
  targetRung: LadderRungId,
  studentAttempt?: string
): { session: HintLadderSession; allowed: boolean; blockReason?: string } {
  const updatedAttempt = studentAttempt ?? session.studentAttemptText;
  const frictionNow = isFrictionSatisfied(updatedAttempt);

  // Check friction rule for R3 and R4
  if ((targetRung === 'R3' || targetRung === 'R4') && !frictionNow) {
    return {
      session,
      allowed: false,
      blockReason:
        'Friction Rule: Before unlocking R3 (Worked Example) or R4 (Check-My-Work), you must type what you have tried so far (minimum 15 characters).',
    };
  }

  const updatedRungs = { ...session.rungs };
  const rungsOrder: LadderRungId[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
  const targetIndex = rungsOrder.indexOf(targetRung);

  for (let i = 0; i <= targetIndex; i++) {
    const id = rungsOrder[i]!;
    const requiresFriction = id === 'R3' || id === 'R4';
    if (!requiresFriction || frictionNow) {
      updatedRungs[id] = {
        ...updatedRungs[id]!,
        isUnlocked: true,
        frictionProvided: requiresFriction ? frictionNow : true,
      };
    }
  }

  return {
    session: {
      ...session,
      currentRung: targetRung,
      studentAttemptText: updatedAttempt,
      frictionSatisfied: frictionNow,
      rungs: updatedRungs,
    },
    allowed: true,
  };
}

