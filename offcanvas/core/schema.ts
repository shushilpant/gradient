import { z } from 'zod';

/**
 * Standard default 4.0 GPA scale with plus/minus distinctions.
 * Can be overridden per user or course preference.
 */
export const DEFAULT_GRADE_POINT_SCALE: Record<string, number> = {
  'A+': 4.0,
  'A': 4.0,
  'A-': 3.7,
  'B+': 3.3,
  'B': 3.0,
  'B-': 2.7,
  'C+': 2.3,
  'C': 2.0,
  'C-': 1.7,
  'D+': 1.3,
  'D': 1.0,
  'D-': 0.7,
  'F': 0.0,
};

/**
 * Standard Canvas percentage-to-letter grading scheme thresholds.
 * Thresholds represent the minimum percentage (inclusive) required for each letter grade.
 */
export const GradingSchemeItemSchema = z.object({
  minPct: z.number().min(0).max(100),
  letter: z.string().min(1),
});
export type GradingSchemeItem = z.infer<typeof GradingSchemeItemSchema>;

export const GradePointScaleSchema = z.record(z.string(), z.number().min(0).max(5.0));
export type GradePointScale = z.infer<typeof GradePointScaleSchema>;

/**
 * Standard Canvas percentage-to-letter grading scheme thresholds.
 * Thresholds represent the minimum percentage (inclusive) required for each letter grade.
 */
export const DEFAULT_GRADING_SCHEME: GradingSchemeItem[] = [
  { minPct: 93, letter: 'A' },
  { minPct: 90, letter: 'A-' },
  { minPct: 87, letter: 'B+' },
  { minPct: 83, letter: 'B' },
  { minPct: 80, letter: 'B-' },
  { minPct: 77, letter: 'C+' },
  { minPct: 73, letter: 'C' },
  { minPct: 70, letter: 'C-' },
  { minPct: 67, letter: 'D+' },
  { minPct: 63, letter: 'D' },
  { minPct: 60, letter: 'D-' },
  { minPct: 0, letter: 'F' },
];

/**
 * Neutral Course Schema
 * creditHours is user-entered because Canvas LMS does not expose credit hours via REST API.
 */
export const CourseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  creditHours: z.number().positive(),
  applyGroupWeights: z.boolean(),
  gradingScheme: z.array(GradingSchemeItemSchema).default(() => [...DEFAULT_GRADING_SCHEME]),
  gradingSchemeSource: z.enum(['canvas', 'default']).optional(),
  gradePointScale: GradePointScaleSchema.default(() => ({ ...DEFAULT_GRADE_POINT_SCALE })),
});
export type Course = z.infer<typeof CourseSchema>;

/**
 * Assignment Group Rules Schema (Drop Rules)
 */
export const AssignmentGroupRulesSchema = z.object({
  dropLowest: z.number().int().nonnegative().default(0),
  dropHighest: z.number().int().nonnegative().default(0),
  neverDrop: z.array(z.string()).default([]),
});
export type AssignmentGroupRules = z.infer<typeof AssignmentGroupRulesSchema>;

/**
 * Assignment Group Schema
 * Weight is a percentage (e.g., 20 means 20% of the total grade).
 */
export const AssignmentGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().nonnegative(),
  rules: AssignmentGroupRulesSchema.default({ dropLowest: 0, dropHighest: 0, neverDrop: [] }),
});
export type AssignmentGroup = z.infer<typeof AssignmentGroupSchema>;

/**
 * Rubric Rating & Criterion Schema
 */
export const RubricRatingSchema = z.object({
  id: z.string().optional(),
  description: z.string(),
  points: z.number().nonnegative(),
});
export type RubricRating = z.infer<typeof RubricRatingSchema>;

export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  points: z.number().nonnegative(),
  ratings: z.array(RubricRatingSchema),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

/**
 * Assignment Schema
 */
export const AssignmentSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  name: z.string().min(1),
  pointsPossible: z.number().nonnegative(),
  dueAt: z.string().nullable().optional(),
  submissionTypes: z.array(z.string()).default([]),
  omitFromFinalGrade: z.boolean().default(false),
  hasRubric: z.boolean().default(false),
  rubric: z.array(RubricCriterionSchema).optional(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

/**
 * Submission Schema with optional rubric assessments and instructor comments
 */
export const RubricAssessmentEntrySchema = z.object({
  points: z.number().nonnegative(),
  ratingId: z.string().optional(),
  comments: z.string().optional(),
});
export type RubricAssessmentEntry = z.infer<typeof RubricAssessmentEntrySchema>;

export const SubmissionCommentSchema = z.object({
  authorName: z.string(),
  comment: z.string(),
  createdAt: z.string().optional(),
});
export type SubmissionComment = z.infer<typeof SubmissionCommentSchema>;

export const SubmissionSchema = z.object({
  assignmentId: z.string().min(1),
  score: z.number().nullable(),
  excused: z.boolean().default(false),
  missing: z.boolean().default(false),
  late: z.boolean().default(false),
  posted: z.boolean().default(true),
  workflowState: z.enum(['unsubmitted', 'submitted', 'graded', 'pending_review']).default('graded'),
  rubricAssessment: z.record(z.string(), RubricAssessmentEntrySchema).optional(),
  submissionComments: z.array(SubmissionCommentSchema).optional(),
});
export type Submission = z.infer<typeof SubmissionSchema>;

/**
 * LMS Adapter Interface
 * All LMS providers (Canvas first, Blackboard roadmap) must implement this interface.
 */
export interface LMSAdapter {
  readonly lmsName: string;
  parseCourse(raw: unknown, creditHours: number): Course;
  parseAssignmentGroups(raw: unknown[]): AssignmentGroup[];
  parseAssignments(raw: unknown[]): Assignment[];
  parseSubmissions(raw: unknown[]): Submission[];
}
