import { describe, it, expect } from 'vitest';
import {
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
  DEFAULT_GRADING_SCHEME,
  DEFAULT_GRADE_POINT_SCALE,
} from '../core/schema.js';

describe('Neutral Internal Schema (Zod Validated)', () => {
  it('validates a correct Course object and assigns defaults', () => {
    const rawCourse = {
      id: 'course-101',
      name: 'Introduction to Computer Systems',
      creditHours: 4.0,
      applyGroupWeights: true,
    };

    const parsed = CourseSchema.parse(rawCourse);
    expect(parsed.id).toBe('course-101');
    expect(parsed.creditHours).toBe(4.0);
    expect(parsed.applyGroupWeights).toBe(true);
    expect(parsed.gradingScheme).toEqual(DEFAULT_GRADING_SCHEME);
    expect(parsed.gradePointScale).toEqual(DEFAULT_GRADE_POINT_SCALE);
  });

  it('rejects a Course with invalid or negative credit hours', () => {
    const invalidCourse = {
      id: 'course-102',
      name: 'Invalid Course',
      creditHours: -1,
      applyGroupWeights: false,
    };

    expect(() => CourseSchema.parse(invalidCourse)).toThrow();
  });

  it('validates AssignmentGroup with drop rules and defaults', () => {
    const rawGroup = {
      id: 'group-1',
      name: 'Homework',
      weight: 35.0,
      rules: {
        dropLowest: 2,
        dropHighest: 0,
        neverDrop: ['hw-1'],
      },
    };

    const parsed = AssignmentGroupSchema.parse(rawGroup);
    expect(parsed.weight).toBe(35.0);
    expect(parsed.rules.dropLowest).toBe(2);
    expect(parsed.rules.neverDrop).toEqual(['hw-1']);
  });

  it('validates Assignment with and without Rubric', () => {
    const assignmentWithRubric = {
      id: 'assign-1',
      groupId: 'group-1',
      name: 'Research Paper',
      pointsPossible: 100,
      dueAt: '2026-11-15T23:59:00Z',
      submissionTypes: ['online_upload'],
      omitFromFinalGrade: false,
      hasRubric: true,
      rubric: [
        {
          id: 'crit-1',
          description: 'Thesis & Argumentation',
          points: 50,
          ratings: [
            { id: 'rat-1', description: 'Exceptional depth', points: 50 },
            { id: 'rat-2', description: 'Adequate thesis', points: 35 },
          ],
        },
      ],
    };

    const parsed = AssignmentSchema.parse(assignmentWithRubric);
    expect(parsed.hasRubric).toBe(true);
    expect(parsed.rubric?.length).toBe(1);
    expect(parsed.rubric?.[0]?.ratings[0]?.points).toBe(50);
  });

  it('validates Submission workflow states and flags', () => {
    const rawSubmission = {
      assignmentId: 'assign-1',
      score: 92.5,
      excused: false,
      missing: false,
      late: false,
      posted: true,
      workflowState: 'graded',
    };

    const parsed = SubmissionSchema.parse(rawSubmission);
    expect(parsed.score).toBe(92.5);
    expect(parsed.workflowState).toBe('graded');
    expect(parsed.excused).toBe(false);
  });
});
