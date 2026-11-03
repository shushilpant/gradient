import { z } from 'zod';

/**
 * AI Policy Tiers:
 * - prohibited: Strict prohibition of generative AI tools. Zero AI features enabled.
 * - permittedForNamedUses: Generative AI allowed only for specific declared uses (e.g. brainstorming, grammar check).
 * - permittedWithDisclosure: Generative AI permitted broadly provided work includes transparency / disclosure statement.
 * - unspecified: Silent or ambiguous syllabus; triggers cautious default and requires student confirmation.
 */
export type PolicyTier =
  | 'prohibited'
  | 'permittedForNamedUses'
  | 'permittedWithDisclosure'
  | 'unspecified';

export const POLICY_TIER_RANK: Record<PolicyTier, number> = {
  prohibited: 3, // Most restrictive
  permittedForNamedUses: 2,
  permittedWithDisclosure: 1,
  unspecified: 0, // Cautious default / silent
};

export type AssessmentType = 'homework' | 'essay' | 'project' | 'quizExam';

export interface PolicyEvidence {
  sentence: string;
  charStart: number;
  charEnd: number;
}

export const PolicyEvidenceSchema = z.object({
  sentence: z.string().min(1),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
});

export interface AIPolicy {
  overall: PolicyTier;
  byAssessmentType: {
    homework: PolicyTier;
    essay: PolicyTier;
    project: PolicyTier;
    quizExam: PolicyTier;
  };
  disclosureRequired: boolean;
  permittedUses: string[];
  evidence: PolicyEvidence[];
}

export interface CourseInfo {
  title?: string;
  code?: string;
  instructor?: string;
}

export interface PolicyExtractionResult {
  courseInfo: CourseInfo;
  gradingNotes?: string;
  aiPolicy: AIPolicy;
  confidence: number; // 0.0 to 1.0
}

export interface DisclosureLogEntry {
  timestamp: string;
  note: string;
  attemptedTier?: PolicyTier;
  effectiveTier: PolicyTier;
  escalationPrevented: boolean;
}

export interface ResolvedPolicy {
  tier: PolicyTier;
  disclosureRequired: boolean;
  permittedUses: string[];
  requiresStudentConfirmation: boolean;
  confirmationSentence?: string;
  confidence: number;
  source: 'syllabus' | 'assignment' | 'combined';
  evidence: PolicyEvidence[];
  disclosureLog: DisclosureLogEntry[];
  studentConfirmed: boolean;
  extractionValid: boolean;
  validationErrors: string[];
}

export type FeatureKey =
  | 'grades'
  | 'deadlines'
  | 'courseMaterials'
  | 'studyRecommendations'
  | 'rubricCritique'
  | 'generativeHints'
  | 'aiChat';

export const NON_AI_FEATURES: ReadonlySet<FeatureKey> = new Set([
  'grades',
  'deadlines',
  'courseMaterials',
  'studyRecommendations',
]);

/**
 * Validates that every evidence sentence appears verbatim in raw text at stated offsets.
 * Rejects the extraction if any character offset differs by even a single character.
 */
export function validateEvidenceSpans(
  rawText: string,
  evidence: PolicyEvidence[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!evidence || evidence.length === 0) {
    return { valid: true, errors: [] };
  }

  for (let i = 0; i < evidence.length; i++) {
    const item = evidence[i];
    if (item === undefined) continue;

    if (typeof item.charStart !== 'number' || typeof item.charEnd !== 'number') {
      errors.push(`Evidence [${i}] missing valid numeric charStart or charEnd.`);
      continue;
    }

    if (item.charStart < 0 || item.charEnd > rawText.length || item.charStart >= item.charEnd) {
      errors.push(
        `Evidence [${i}] invalid span offsets [${item.charStart}, ${item.charEnd}] for text length ${rawText.length}.`
      );
      continue;
    }

    const actual = rawText.slice(item.charStart, item.charEnd);
    if (actual !== item.sentence) {
      errors.push(
        `Evidence [${i}] verbatim mismatch: expected "${item.sentence}", found "${actual}" at [${item.charStart}, ${item.charEnd}].`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Returns the most restrictive of two policy tiers.
 * Hierarchy: prohibited (3) > permittedForNamedUses (2) > permittedWithDisclosure (1) > unspecified (0).
 */
export function getMostRestrictiveTier(tierA: PolicyTier, tierB: PolicyTier): PolicyTier {
  const rankA = POLICY_TIER_RANK[tierA] ?? 0;
  const rankB = POLICY_TIER_RANK[tierB] ?? 0;

  if (rankA >= rankB) {
    return tierA;
  }
  return tierB;
}

/**
 * Resolves the effective policy by combining syllabus extraction, assignment brief,
 * and assessment-type specific overrides. Enforces that the most restrictive rule wins.
 */
export function resolveEffectivePolicy(options: {
  rawSyllabusText: string;
  syllabusExtraction: PolicyExtractionResult;
  rawAssignmentText?: string;
  assignmentExtraction?: PolicyExtractionResult;
  assessmentType?: AssessmentType;
  studentConfirmed?: boolean;
}): ResolvedPolicy {
  const {
    rawSyllabusText,
    syllabusExtraction,
    rawAssignmentText,
    assignmentExtraction,
    assessmentType,
    studentConfirmed = false,
  } = options;

  // 1. Validate syllabus evidence verbatim spans
  const syllabusValidation = validateEvidenceSpans(
    rawSyllabusText,
    syllabusExtraction.aiPolicy.evidence
  );

  let effectiveSyllabusPolicy = syllabusExtraction.aiPolicy;
  let effectiveConfidence = syllabusExtraction.confidence;
  const validationErrors = [...syllabusValidation.errors];

  if (!syllabusValidation.valid) {
    // Verbatim validation failed: reject extraction, fall back to unspecified cautious default
    effectiveSyllabusPolicy = {
      overall: 'unspecified',
      byAssessmentType: {
        homework: 'unspecified',
        essay: 'unspecified',
        project: 'unspecified',
        quizExam: 'unspecified',
      },
      disclosureRequired: false,
      permittedUses: [],
      evidence: [],
    };
    effectiveConfidence = 0.0;
  }

  // 2. Determine base tier from syllabus (considering assessmentType override if present)
  let baseTier = effectiveSyllabusPolicy.overall;
  if (assessmentType && effectiveSyllabusPolicy.byAssessmentType[assessmentType]) {
    const specificTier = effectiveSyllabusPolicy.byAssessmentType[assessmentType];
    // Specific assessment rule takes effect, but cannot be less restrictive than overall if overall was prohibited
    baseTier = getMostRestrictiveTier(baseTier, specificTier);
  }

  let finalTier = baseTier;
  let source: 'syllabus' | 'assignment' | 'combined' = 'syllabus';
  let disclosureRequired = effectiveSyllabusPolicy.disclosureRequired;
  let permittedUses = [...effectiveSyllabusPolicy.permittedUses];
  let evidence = [...effectiveSyllabusPolicy.evidence];

  // 3. Evaluate assignment-level extraction if available
  if (assignmentExtraction) {
    let assignmentValid = true;
    if (rawAssignmentText) {
      const assignValidation = validateEvidenceSpans(
        rawAssignmentText,
        assignmentExtraction.aiPolicy.evidence
      );
      if (!assignValidation.valid) {
        assignmentValid = false;
        validationErrors.push(...assignValidation.errors);
      }
    }

    if (assignmentValid) {
      const assignTier = assignmentExtraction.aiPolicy.overall;
      // Most restrictive rule wins (assignment brief beats syllabus when stricter)
      const combinedTier = getMostRestrictiveTier(finalTier, assignTier);

      if (combinedTier !== finalTier) {
        source = 'assignment';
        finalTier = combinedTier;
      } else if (assignTier !== 'unspecified') {
        source = 'combined';
      }

      if (assignmentExtraction.aiPolicy.disclosureRequired) {
        disclosureRequired = true;
      }

      if (finalTier === 'permittedForNamedUses') {
        // If assignment specifies named uses, restrict to assignment's permitted uses
        if (assignmentExtraction.aiPolicy.permittedUses.length > 0) {
          permittedUses = assignmentExtraction.aiPolicy.permittedUses;
        }
      }

      evidence = [...evidence, ...assignmentExtraction.aiPolicy.evidence];
      effectiveConfidence = Math.min(effectiveConfidence, assignmentExtraction.confidence);
    }
  }

  // 4. Cautious default trigger:
  // Unspecified or low confidence (< 0.70) requires explicit student confirmation
  const isUnspecified = finalTier === 'unspecified';
  const isLowConfidence = effectiveConfidence < 0.70;
  const requiresStudentConfirmation = (isUnspecified || isLowConfidence) && finalTier !== 'prohibited';

  const confirmationSentence = evidence.length > 0 ? evidence[0]?.sentence : undefined;

  return {
    tier: finalTier,
    disclosureRequired,
    permittedUses,
    requiresStudentConfirmation,
    confirmationSentence,
    confidence: effectiveConfidence,
    source,
    evidence,
    disclosureLog: [],
    studentConfirmed,
    extractionValid: syllabusValidation.valid,
    validationErrors,
  };
}

/**
 * Handles a student note attempting to declare a different AI policy (e.g. "instructor said in class").
 * HARD RULE: No override can escalate beyond the verified tier.
 * If the student attempts to relax restrictions (e.g. claims permitted when prohibited),
 * the escalation is blocked, effective tier remains unchanged, and the claim is logged to disclosureLog.
 */
export function applyStudentOverrideNote(
  currentPolicy: ResolvedPolicy,
  note: string,
  attemptedTier?: PolicyTier
): {
  effectivePolicy: ResolvedPolicy;
  logEntry: DisclosureLogEntry;
} {
  const currentRank = POLICY_TIER_RANK[currentPolicy.tier];
  let escalationPrevented = false;
  let newTier = currentPolicy.tier;

  if (attemptedTier) {
    const attemptedRank = POLICY_TIER_RANK[attemptedTier];
    if (attemptedRank < currentRank) {
      // Attempting to downgrade restriction (e.g. prohibited (3) -> permitted (1)): BLOCKED!
      escalationPrevented = true;
      newTier = currentPolicy.tier;
    } else {
      // Attempting to self-impose a MORE restrictive tier: allowed
      newTier = attemptedTier;
    }
  }

  const logEntry: DisclosureLogEntry = {
    timestamp: new Date().toISOString(),
    note,
    attemptedTier,
    effectiveTier: newTier,
    escalationPrevented,
  };

  const updatedPolicy: ResolvedPolicy = {
    ...currentPolicy,
    tier: newTier,
    disclosureLog: [...currentPolicy.disclosureLog, logEntry],
  };

  return {
    effectivePolicy: updatedPolicy,
    logEntry,
  };
}

/**
 * Checks whether a specific feature is permitted under the resolved AI policy.
 * - Non-AI features (grades, deadlines, courseMaterials, studyRecommendations) are ALWAYS allowed.
 * - In 'prohibited' tier: every AI-generated feature is STRICTLY disallowed (false).
 * - In 'unspecified' tier or unconfirmed low-confidence: cautious default gates AI features (false).
 * - In 'permittedForNamedUses': only features matching permittedUses are allowed.
 * - In 'permittedWithDisclosure': AI features allowed provided disclosure is included.
 */
export function isFeatureAllowed(
  policy: ResolvedPolicy,
  feature: FeatureKey,
  context?: { specificUse?: string }
): boolean {
  // Non-AI features are always accessible
  if (NON_AI_FEATURES.has(feature)) {
    return true;
  }

  // HARD INVARIANT: Prohibited tier hides all AI features
  if (policy.tier === 'prohibited') {
    return false;
  }

  // Cautious default: if confirmation is required and not confirmed by student, lock AI features
  if (policy.requiresStudentConfirmation && !policy.studentConfirmed) {
    return false;
  }

  if (policy.tier === 'unspecified') {
    // Without explicit student confirmation, unspecified defaults to cautious lock
    return false;
  }

  if (policy.tier === 'permittedForNamedUses') {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');
    const useToCheck = normalize(context?.specificUse ?? feature);
    const isPermitted = policy.permittedUses.some((u) => {
      const lower = normalize(u);
      return useToCheck.includes(lower) || lower.includes(useToCheck);
    });
    return isPermitted;
  }

  if (policy.tier === 'permittedWithDisclosure') {
    return true;
  }

  return false;
}

/**
 * Generates drafted question-to-instructor email text for the student
 * when the course syllabus is silent or ambiguous regarding AI tools.
 */
export function draftQuestionToInstructor(params: {
  courseName?: string;
  instructorName?: string;
  studentName?: string;
  assessmentName?: string;
  intendedUse?: string;
}): string {
  const instructor = params.instructorName ? `Professor ${params.instructorName}` : 'Professor';
  const course = params.courseName ? ` in ${params.courseName}` : '';
  const assignment = params.assessmentName ? ` for ${params.assessmentName}` : ' for our upcoming assignments';
  const use = params.intendedUse
    ? params.intendedUse
    : 'conceptual brainstorming, outlining, and rubric self-critique (without generating submitted text)';
  const student = params.studentName || '[Your Name]';

  return `Dear ${instructor},

I am writing to respectfully ask for clarification regarding your policy on generative AI tools${course}${assignment}.

I would like to know if it is permitted to use AI assistance strictly for ${use}. Any permissible use would be fully cited and disclosed according to your guidelines, and no AI tool would be used to generate submitted text.

Could you please clarify whether this type of preparation is allowed under your course academic integrity guidelines, or if you prefer students refrain from all AI tools?

Thank you for your guidance and time.

Sincerely,
${student}`;
}

