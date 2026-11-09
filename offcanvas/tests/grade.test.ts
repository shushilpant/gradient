import { describe, it, expect } from 'vitest';
import {
  computeCanvasGrade,
  determineDroppedAssignments,
  getLetterGrade,
  getGradePoints,
} from '../core/grade.js';
import {
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
  DEFAULT_GRADING_SCHEME,
  DEFAULT_GRADE_POINT_SCALE,
} from '../core/schema.js';

describe('Canvas Exact Grade Computation Engine (Feature A)', () => {
  const baseCourse = CourseSchema.parse({
    id: 'cs101',
    name: 'CS 101: Introduction to Algorithms',
    creditHours: 3.0,
    applyGroupWeights: true,
  });

  it('drops the lowest score in a group while respecting neverDrop', () => {
    const items = [
      { assignmentId: 'hw1', name: 'HW 1', score: 95, pointsPossible: 100, isNeverDrop: true },
      { assignmentId: 'hw2', name: 'HW 2', score: 72, pointsPossible: 100, isNeverDrop: false },
      { assignmentId: 'hw3', name: 'HW 3', score: 90, pointsPossible: 100, isNeverDrop: false },
      { assignmentId: 'hw4', name: 'HW 4', score: 88, pointsPossible: 100, isNeverDrop: false },
    ];

    const result = determineDroppedAssignments(items, {
      dropLowest: 1,
      dropHighest: 0,
      neverDrop: ['hw1'],
    });

    expect(result.dropped).toEqual(['hw2']);
    expect(result.kept.map((k) => k.assignmentId)).toEqual(['hw1', 'hw3', 'hw4']);
  });

  it('protects neverDrop assignment even if it has the lowest score', () => {
    const items = [
      { assignmentId: 'hw1', name: 'HW 1', score: 40, pointsPossible: 100, isNeverDrop: true },
      { assignmentId: 'hw2', name: 'HW 2', score: 65, pointsPossible: 100, isNeverDrop: false },
      { assignmentId: 'hw3', name: 'HW 3', score: 90, pointsPossible: 100, isNeverDrop: false },
    ];

    const result = determineDroppedAssignments(items, {
      dropLowest: 1,
      dropHighest: 0,
      neverDrop: ['hw1'],
    });

    // hw1 cannot be dropped despite having 40; hw2 (65) is dropped instead
    expect(result.dropped).toEqual(['hw2']);
    expect(result.kept.map((k) => k.assignmentId)).toEqual(['hw1', 'hw3']);
  });

  it('tie-breaks varying points possible to maximize resulting group ratio', () => {
    // 0/10 vs 0/100: dropping 0/100 improves score much more than dropping 0/10
    const items = [
      { assignmentId: 'quiz_small', name: 'Pop Quiz', score: 0, pointsPossible: 10, isNeverDrop: false },
      { assignmentId: 'quiz_big', name: 'Large Quiz', score: 0, pointsPossible: 100, isNeverDrop: false },
      { assignmentId: 'quiz_ok', name: 'Standard Quiz', score: 80, pointsPossible: 100, isNeverDrop: false },
    ];

    const result = determineDroppedAssignments(items, {
      dropLowest: 1,
      dropHighest: 0,
      neverDrop: [],
    });

    expect(result.dropped).toEqual(['quiz_big']);
  });

  it('calculates full Canvas course grade with weighted groups and drops', () => {
    const groups = [
      AssignmentGroupSchema.parse({
        id: 'g_hw',
        name: 'Homework',
        weight: 40.0,
        rules: { dropLowest: 1, dropHighest: 0, neverDrop: ['hw1'] },
      }),
      AssignmentGroupSchema.parse({
        id: 'g_midterm',
        name: 'Midterm Exams',
        weight: 30.0,
      }),
      AssignmentGroupSchema.parse({
        id: 'g_final',
        name: 'Final Project',
        weight: 30.0,
      }),
    ];

    const assignments = [
      AssignmentSchema.parse({ id: 'hw1', groupId: 'g_hw', name: 'HW 1', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'hw2', groupId: 'g_hw', name: 'HW 2', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'hw3', groupId: 'g_hw', name: 'HW 3', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'hw4', groupId: 'g_hw', name: 'HW 4', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'mid1', groupId: 'g_midterm', name: 'Midterm 1', pointsPossible: 100 }),
      AssignmentSchema.parse({
        id: 'proj_draft',
        groupId: 'g_final',
        name: 'Project Draft',
        pointsPossible: 50,
        omitFromFinalGrade: true,
      }),
      AssignmentSchema.parse({ id: 'proj_final', groupId: 'g_final', name: 'Project Final', pointsPossible: 100 }),
    ];

    const submissions = [
      SubmissionSchema.parse({ assignmentId: 'hw1', score: 95 }),
      SubmissionSchema.parse({ assignmentId: 'hw2', score: 72 }), // Will be dropped
      SubmissionSchema.parse({ assignmentId: 'hw3', score: 90 }),
      SubmissionSchema.parse({ assignmentId: 'hw4', score: 88 }),
      SubmissionSchema.parse({ assignmentId: 'mid1', score: 85 }),
      SubmissionSchema.parse({ assignmentId: 'proj_draft', score: 48 }), // Omitted from final grade
      SubmissionSchema.parse({ assignmentId: 'proj_final', score: 94 }),
    ];

    const grade = computeCanvasGrade(baseCourse, groups, assignments, submissions);

    // Expected:
    // HW group: (95 + 90 + 88) / 300 = 273 / 300 = 91.0% (hw2 dropped)
    // Midterm group: 85 / 100 = 85.0%
    // Final group: 94 / 100 = 94.0% (proj_draft omitted)
    // Weighted Total: (91.0 * 0.40) + (85.0 * 0.30) + (94.0 * 0.30)
    //               = 36.4 + 25.5 + 28.2 = 90.1%
    expect(grade.percentage).toBe(90.1);
    expect(grade.letterGrade).toBe('A-');
    expect(grade.gradePoints).toBe(3.7);
    expect(grade.droppedAssignmentIds).toEqual(['hw2']);

    const hwGroup = grade.groups.find((g) => g.groupId === 'g_hw');
    expect(hwGroup?.percentage).toBe(91);
    expect(hwGroup?.pointsEarned).toBe(273);
    expect(hwGroup?.pointsPossible).toBe(300);
    expect(hwGroup?.droppedAssignmentIds).toEqual(['hw2']);
  });

  it('omits excused and unposted assignments properly', () => {
    const course = CourseSchema.parse({
      id: 'cs102',
      name: 'CS 102',
      creditHours: 3.0,
      applyGroupWeights: false,
    });

    const groups = [AssignmentGroupSchema.parse({ id: 'g1', name: 'All', weight: 100 })];
    const assignments = [
      AssignmentSchema.parse({ id: 'a1', groupId: 'g1', name: 'A1', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'a2', groupId: 'g1', name: 'A2 (Excused)', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'a3', groupId: 'g1', name: 'A3 (Hidden)', pointsPossible: 100 }),
    ];

    const submissions = [
      SubmissionSchema.parse({ assignmentId: 'a1', score: 90, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'a2', score: 0, excused: true, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'a3', score: 50, posted: false }), // Unposted
    ];

    const grade = computeCanvasGrade(course, groups, assignments, submissions, {
      includeUnposted: false,
    });

    // Only a1 counts: 90 / 100 = 90.0%
    expect(grade.percentage).toBe(90.0);
    expect(grade.totalPointsEarned).toBe(90);
    expect(grade.totalPointsPossible).toBe(100);
  });

  it('matches letter grade and GPA point scale conversion', () => {
    expect(getLetterGrade(95.0, DEFAULT_GRADING_SCHEME)).toBe('A');
    expect(getLetterGrade(91.2, DEFAULT_GRADING_SCHEME)).toBe('A-');
    expect(getLetterGrade(88.0, DEFAULT_GRADING_SCHEME)).toBe('B+');
    expect(getLetterGrade(84.0, DEFAULT_GRADING_SCHEME)).toBe('B');
    expect(getLetterGrade(79.9, DEFAULT_GRADING_SCHEME)).toBe('C+');
    expect(getLetterGrade(58.0, DEFAULT_GRADING_SCHEME)).toBe('F');

    expect(getGradePoints('A', DEFAULT_GRADE_POINT_SCALE)).toBe(4.0);
    expect(getGradePoints('A-', DEFAULT_GRADE_POINT_SCALE)).toBe(3.7);
    expect(getGradePoints('B+', DEFAULT_GRADE_POINT_SCALE)).toBe(3.3);
    expect(getGradePoints('F', DEFAULT_GRADE_POINT_SCALE)).toBe(0.0);
  });
});

