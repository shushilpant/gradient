import {
  type LMSAdapter,
  type Course,
  type AssignmentGroup,
  type Assignment,
  type Submission,
  type RubricCriterion,
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
  RubricCriterionSchema,
  DEFAULT_GRADING_SCHEME,
  DEFAULT_GRADE_POINT_SCALE,
} from '../../core/schema.js';

interface RawCanvasGradingSchemeItem {
  name?: string;
  value?: number;
  [key: string]: unknown;
}

interface RawCanvasCourse {
  id: number | string;
  name: string;
  course_code?: string;
  apply_assignment_group_weights?: boolean;
  grading_standard?: RawCanvasGradingSchemeItem[];
  grading_scheme?: RawCanvasGradingSchemeItem[];
  syllabus_body?: string;
  [key: string]: unknown;
}

interface RawCanvasGroupRules {
  drop_lowest?: number;
  drop_highest?: number;
  never_drop?: (number | string)[];
}

interface RawCanvasAssignmentGroup {
  id: number | string;
  name: string;
  group_weight?: number;
  rules?: RawCanvasGroupRules;
  assignments?: unknown[];
  [key: string]: unknown;
}

interface RawCanvasRubricRating {
  id?: string | number;
  description?: string;
  points?: number;
}

interface RawCanvasRubricCriterion {
  id: string | number;
  description?: string;
  points?: number;
  ratings?: RawCanvasRubricRating[];
}

interface RawCanvasAssignment {
  id: number | string;
  assignment_group_id: number | string;
  name: string;
  points_possible?: number | null;
  due_at?: string | null;
  submission_types?: string[];
  omit_from_final_grade?: boolean;
  rubric?: RawCanvasRubricCriterion[];
  [key: string]: unknown;
}

interface RawCanvasSubmission {
  assignment_id: number | string;
  score?: number | null;
  excused?: boolean;
  missing?: boolean;
  late?: boolean;
  posted_at?: string | null;
  workflow_state?: string;
  [key: string]: unknown;
}

/**
 * Canvas LMS Adapter
 * Maps verified raw Canvas REST API payloads into Zod-validated neutral internal schema.
 */
export class CanvasAdapter implements LMSAdapter {
  readonly lmsName = 'Canvas LMS';

  parseCourse(raw: unknown, creditHours: number): Course {
    const data = raw as RawCanvasCourse;

    // Normalise grading scheme if provided by Canvas
    let gradingScheme: Array<{ minPct: number; letter: string }> = DEFAULT_GRADING_SCHEME.map((item) => ({ ...item }));
    const rawScheme = data.grading_standard ?? data.grading_scheme;

    if (Array.isArray(rawScheme) && rawScheme.length > 0) {
      gradingScheme = rawScheme.map((entry) => {
        let letter = 'F';
        let minPct = 0;

        if (Array.isArray(entry) && entry.length >= 2) {
          letter = String(entry[0]);
          const val = Number(entry[1]);
          minPct = val <= 1.0 ? Math.round(val * 100) : val;
        } else if (typeof entry === 'object' && entry !== null) {
          letter = String(entry.name ?? 'F');
          const val = Number(entry.value ?? 0);
          minPct = val <= 1.0 ? Math.round(val * 100) : val;
        }

        return { letter, minPct };
      });
    }

    const courseData = {
      id: String(data.id),
      name: data.name,
      creditHours,
      applyGroupWeights: Boolean(data.apply_assignment_group_weights),
      gradingScheme,
      gradePointScale: DEFAULT_GRADE_POINT_SCALE,
    };

    return CourseSchema.parse(courseData);
  }

  parseAssignmentGroups(rawList: unknown[]): AssignmentGroup[] {
    return rawList.map((item) => {
      const g = item as RawCanvasAssignmentGroup;
      const rules = {
        dropLowest: g.rules?.drop_lowest ?? 0,
        dropHighest: g.rules?.drop_highest ?? 0,
        neverDrop: (g.rules?.never_drop ?? []).map((id) => String(id)),
      };

      const groupData = {
        id: String(g.id),
        name: g.name,
        weight: Number(g.group_weight ?? 0),
        rules,
      };

      return AssignmentGroupSchema.parse(groupData);
    });
  }

  parseAssignments(rawList: unknown[]): Assignment[] {
    return rawList.map((item) => {
      const a = item as RawCanvasAssignment;
      let rubric: RubricCriterion[] | undefined;

      if (Array.isArray(a.rubric) && a.rubric.length > 0) {
        rubric = a.rubric.map((r) => ({
          id: String(r.id),
          description: r.description ?? '',
          points: Number(r.points ?? 0),
          ratings: (r.ratings ?? []).map((rat) => ({
            id: rat.id ? String(rat.id) : undefined,
            description: rat.description ?? '',
            points: Number(rat.points ?? 0),
          })),
        }));
      }

      const assignmentData = {
        id: String(a.id),
        groupId: String(a.assignment_group_id),
        name: a.name,
        pointsPossible: Number(a.points_possible ?? 0),
        dueAt: a.due_at ?? null,
        submissionTypes: a.submission_types ?? [],
        omitFromFinalGrade: Boolean(a.omit_from_final_grade),
        hasRubric: Boolean(rubric && rubric.length > 0),
        rubric,
      };

      return AssignmentSchema.parse(assignmentData);
    });
  }

  parseSubmissions(rawList: unknown[]): Submission[] {
    return rawList.map((item) => {
      const s = item as RawCanvasSubmission;

      // In Canvas, posted_at is null if grades are hidden under manual posting policy
      const posted = s.posted_at !== null && s.posted_at !== undefined;

      let workflowState: 'unsubmitted' | 'submitted' | 'graded' | 'pending_review' = 'graded';
      if (s.workflow_state === 'unsubmitted') {
        workflowState = 'unsubmitted';
      } else if (s.workflow_state === 'submitted') {
        workflowState = 'submitted';
      } else if (s.workflow_state === 'pending_review') {
        workflowState = 'pending_review';
      }

      const submissionData = {
        assignmentId: String(s.assignment_id),
        score: typeof s.score === 'number' ? s.score : null,
        excused: Boolean(s.excused),
        missing: Boolean(s.missing),
        late: Boolean(s.late),
        posted,
        workflowState,
      };

      return SubmissionSchema.parse(submissionData);
    });
  }

  parseRubrics(rawList: unknown[]): RubricCriterion[] {
    const criteria: RubricCriterion[] = [];
    for (const item of rawList) {
      const rawObj = item as Record<string, any>;
      const rawCriteriaList = Array.isArray(rawObj.rubric)
        ? rawObj.rubric
        : Array.isArray(rawObj.data)
        ? rawObj.data
        : Array.isArray(rawObj)
        ? rawObj
        : [];

      for (const r of rawCriteriaList) {
        const criterion = {
          id: String(r.id),
          description: r.description ?? '',
          points: Number(r.points ?? 0),
          ratings: (r.ratings ?? []).map((rat: any) => ({
            id: rat.id ? String(rat.id) : undefined,
            description: rat.description ?? '',
            points: Number(rat.points ?? 0),
          })),
        };
        criteria.push(RubricCriterionSchema.parse(criterion));
      }
    }
    return criteria;
  }
}
