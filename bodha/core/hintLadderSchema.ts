import { z } from 'zod';

export type LadderRungId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type VerificationStatus = 'verified' | 'unverified' | 'weaker_heuristic';
export type ProblemDomain = 'math_symbolic' | 'code_execution' | 'essay_conceptual';

export const LadderRungSchema = z.object({
  rungId: z.enum(['R0', 'R1', 'R2', 'R3', 'R4']),
  title: z.string().min(1),
  content: z.string().default(''),
  isUnlocked: z.boolean(),
  requiresFrictionInput: z.boolean(),
  frictionProvided: z.boolean(),
  variantProblem: z.string().optional(),
  variantSolution: z.string().optional(),
  verificationStatus: z.enum(['verified', 'unverified', 'weaker_heuristic']),
  verificationDetails: z.string().optional(),
  leakCheckPassed: z.boolean(),
});

export type LadderRung = z.infer<typeof LadderRungSchema>;

export const HintLadderSessionSchema = z.object({
  assignmentId: z.string(),
  courseId: z.string(),
  problemText: z.string(),
  domain: z.enum(['math_symbolic', 'code_execution', 'essay_conceptual']),
  currentRung: z.enum(['R0', 'R1', 'R2', 'R3', 'R4']),
  rungs: z.object({
    R0: LadderRungSchema,
    R1: LadderRungSchema,
    R2: LadderRungSchema,
    R3: LadderRungSchema,
    R4: LadderRungSchema,
  }),
  studentAttemptText: z.string().optional(),
  frictionSatisfied: z.boolean(),
  isLeakDetected: z.boolean(),
  leakExplanation: z.string().optional(),
});

export type HintLadderSession = z.infer<typeof HintLadderSessionSchema>;

export const GenerateHintLadderRequestSchema = z.object({
  assignmentId: z.string(),
  courseId: z.string(),
  problemText: z.string().min(5),
  studentAttempt: z.string().optional(),
  targetRung: z.enum(['R0', 'R1', 'R2', 'R3', 'R4']).default('R0'),
  domain: z.enum(['math_symbolic', 'code_execution', 'essay_conceptual']).default('math_symbolic'),
});

export type GenerateHintLadderRequest = z.infer<typeof GenerateHintLadderRequestSchema>;
