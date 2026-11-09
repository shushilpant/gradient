import { z } from 'zod';

export const BusyBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(), // ISO 8601
  endTime: z.string(),   // ISO 8601
  source: z.enum(['canvas_calendar', 'pasted_ical', 'manual']).default('manual'),
});

export type BusyBlock = z.infer<typeof BusyBlockSchema>;

export const HourRangeSchema = z.object({
  startHour: z.number().min(0).max(24),
  endHour: z.number().min(0).max(24),
});

export type HourRange = z.infer<typeof HourRangeSchema>;

export const SchedulerPreferencesSchema = z.object({
  sleepWindow: HourRangeSchema.default({ startHour: 23, endHour: 7 }),
  maxBlockLengthHours: z.number().min(0.5).max(6.0).default(2.0),
  preferredHours: z.array(HourRangeSchema).default([
    { startHour: 9, endHour: 12 },
    { startHour: 14, endHour: 18 },
  ]),
  dailyCapHours: z.number().min(1.0).max(14.0).default(6.0),
  finishBeforeDeadlineBufferHours: z.number().min(0.0).max(24.0).default(2.0),
});

export type SchedulerPreferences = z.infer<typeof SchedulerPreferencesSchema>;

export const AssignmentStudyRequirementSchema = z.object({
  assignmentId: z.string(),
  courseId: z.string(),
  assignmentName: z.string(),
  courseCode: z.string(),
  dueAt: z.string(), // ISO 8601
  hoursNeeded: z.number().min(0.5),
  priorityWeight: z.number().default(1.0),
});

export type AssignmentStudyRequirement = z.infer<typeof AssignmentStudyRequirementSchema>;

export const StudyBlockSchema = z.object({
  id: z.string(), // Stable UID e.g. bodha-cs101-hw3-b0@bodha.app
  assignmentId: z.string(),
  courseId: z.string(),
  assignmentName: z.string(),
  courseCode: z.string(),
  startTime: z.string(), // ISO 8601
  endTime: z.string(),   // ISO 8601
  durationMinutes: z.number().positive(),
  blockIndex: z.number().int().nonnegative(),
  totalBlocks: z.number().int().positive(),
  status: z.enum(['scheduled', 'completed', 'missed']).default('scheduled'),
  sequence: z.number().int().nonnegative().default(0),
});

export type StudyBlock = z.infer<typeof StudyBlockSchema>;

export const CrunchWeekSchema = z.object({
  weekNumber: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
  scheduledStudyHours: z.number(),
  capacityHours: z.number(),
  assignmentsDueCount: z.number().int(),
  crunchRatio: z.number(),
  crunchLevel: z.enum(['balanced', 'moderate', 'high']),
});

export type CrunchWeek = z.infer<typeof CrunchWeekSchema>;

export const CrunchRadarReportSchema = z.object({
  weeks: z.array(CrunchWeekSchema),
  totalHoursScheduled: z.number(),
  highestCrunchWeek: z.number().int().optional(),
  recommendations: z.array(z.string()),
});

export type CrunchRadarReport = z.infer<typeof CrunchRadarReportSchema>;

export const SchedulePlanSchema = z.object({
  blocks: z.array(StudyBlockSchema),
  solverUsed: z.enum(['ortools_cpsat', 'greedy_fallback']),
  isFeasible: z.boolean(),
  scheduledHours: z.number(),
  requestedHours: z.number(),
  crunchRadar: CrunchRadarReportSchema,
  unplacedRequirements: z.array(AssignmentStudyRequirementSchema).optional(),
});

export type SchedulePlan = z.infer<typeof SchedulePlanSchema>;

export const AnnouncementChangeAlertSchema = z.object({
  id: z.string(),
  announcementId: z.string(),
  title: z.string(),
  courseId: z.string(),
  assignmentId: z.string(),
  assignmentName: z.string(),
  originalDueDate: z.string(),
  detectedDueDate: z.string(),
  verbatimSentence: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['pending_confirmation', 'confirmed', 'dismissed']).default('pending_confirmation'),
});

export type AnnouncementChangeAlert = z.infer<typeof AnnouncementChangeAlertSchema>;

