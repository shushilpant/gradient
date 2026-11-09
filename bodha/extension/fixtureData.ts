/**
 * OffCanvas Offline Fixture Loader
 * 
 * Provides recorded synthetic Canvas course fixtures so the UI, demo,
 * and Playwright acceptance tests run with ZERO network access.
 */

import { CanvasAdapter } from './adapter/canvasAdapter.js';
import { type CourseOptimizationInput } from '../core/optimiser.js';
import { type CourseData } from '../core/gradeModel.js';
import { type ResolvedPolicy } from '../core/policyGate.js';

// Import recorded fixtures directly for zero-network execution
import sandboxFixtures from '../sandbox/fixtures/sandbox_all_courses.json';

const adapter = new CanvasAdapter();

export function getFixtureCourses(): CourseOptimizationInput[] {
  const bundle = sandboxFixtures as Array<{
    course: any;
    assignment_groups: any[];
    assignments: any[];
    submissions: any[];
    enrollment: any;
  }>;

  return bundle.map((item, idx) => {
    // Default credit hours: CS 101: 4.0, MATH 201: 3.0, BIO 110: 4.0
    const credits = idx === 0 ? 4.0 : idx === 1 ? 3.0 : 4.0;
    const course = adapter.parseCourse(item.course, credits);
    const groups = adapter.parseAssignmentGroups(item.assignment_groups);
    const assignments = adapter.parseAssignments(item.assignments);
    const submissions = adapter.parseSubmissions(item.submissions);

    return {
      course,
      groups,
      assignments,
      submissions,
      priorityWeight: 1.0,
      loggedHours: {
        '1008': 3.5, // Alex already logged 3.5h on CS 101 Final Project Implementation
      },
    };
  });
}

export function getFixtureCourseData(courseId?: string): CourseData | null {
  const courses = getFixtureCourses();
  if (courses.length === 0) return null;

  const target = courseId
    ? courses.find((c) => String(c.course.id) === String(courseId)) ?? courses[0]!
    : courses[0]!;

  return {
    course: target.course,
    groups: target.groups,
    assignments: target.assignments,
    submissions: target.submissions,
  };
}

export function getRawSandboxRubrics(): any[] {
  // Return rubrics attached to synthetic courses
  return [
    {
      id: 'rubric_4',
      title: 'HW 1 Algorithmic Rubric',
      criteria: [
        {
          id: 'crit_1',
          description: 'Asymptotic Analysis & Big-O Formulations',
          points: 50,
          ratings: [
            { id: 'r1', description: 'Rigorous mathematical proof with formal limit/bound definitions', points: 50 },
            { id: 'r2', description: 'Correct bound identified with minor notation gaps', points: 40 },
            { id: 'r3', description: 'Flawed recurrence tree or asymptotic loose bound', points: 25 },
          ],
        },
        {
          id: 'crit_2',
          description: 'Recurrence Relations & Master Theorem Application',
          points: 50,
          ratings: [
            { id: 'r4', description: 'Flawless Master Theorem case identification and proof', points: 50 },
            { id: 'r5', description: 'Correct case with algebraic simplification slip', points: 40 },
            { id: 'r6', description: 'Incorrect theorem case applied', points: 20 },
          ],
        },
      ],
    },
    {
      id: 'rubric_6',
      title: 'Final Project Comprehensive Rubric',
      criteria: [
        {
          id: 'crit_fp_1',
          description: 'System Architecture & Algorithmic Correctness',
          points: 40,
          ratings: [
            { id: 'rf1', description: 'Complete, elegant implementation meeting all performance constraints', points: 40 },
            { id: 'rf2', description: 'Functional implementation with sub-optimal memory profile', points: 30 },
            { id: 'rf3', description: 'Fails edge cases or exceeds time complexity budget', points: 15 },
          ],
        },
        {
          id: 'crit_fp_2',
          description: 'Empirical Benchmark & Evaluation Report',
          points: 35,
          ratings: [
            { id: 'rf4', description: 'Comprehensive matplotlib/KaTeX graphs and scaling analysis', points: 35 },
            { id: 'rf5', description: 'Basic timing tests without formal variance error bars', points: 25 },
            { id: 'rf6', description: 'Missing benchmark baseline comparison', points: 10 },
          ],
        },
        {
          id: 'crit_fp_3',
          description: 'Code Quality, Modularity & Documentation',
          points: 25,
          ratings: [
            { id: 'rf7', description: 'Strict typing, pure functions, comprehensive unit tests', points: 25 },
            { id: 'rf8', description: 'Good structure with minor documentation omissions', points: 18 },
            { id: 'rf9', description: 'Monolithic organization or poor test coverage', points: 8 },
          ],
        },
      ],
    },
  ];
}

export function getCourseAIPolicy(courseId: string): ResolvedPolicy {
  if (courseId === '99002') {
    // MATH 201: Prohibited
    return {
      tier: 'prohibited',
      disclosureRequired: false,
      permittedUses: [],
      requiresStudentConfirmation: false,
      confidence: 0.95,
      source: 'syllabus',
      evidence: [
        {
          sentence: 'Generative AI usage on proof writeups is strictly prohibited without prior written authorization.',
          charStart: 85,
          charEnd: 183,
        },
      ],
      disclosureLog: [],
      studentConfirmed: true,
      extractionValid: true,
      validationErrors: [],
    };
  }

  if (courseId === '99003') {
    // BIO 110: Unspecified (cautious default)
    return {
      tier: 'unspecified',
      disclosureRequired: false,
      permittedUses: [],
      requiresStudentConfirmation: true,
      confidence: 0.0,
      source: 'syllabus',
      evidence: [],
      disclosureLog: [],
      studentConfirmed: false,
      extractionValid: true,
      validationErrors: [],
    };
  }

  // CS 101: Permitted for Named Uses (allows conceptual understanding, hint exploration, and rubric critique)
  return {
    tier: 'permittedForNamedUses',
    disclosureRequired: true,
    permittedUses: ['conceptual understanding', 'hint exploration', 'rubric critique', 'draft feedback'],
    requiresStudentConfirmation: false,
    confidence: 0.92,
    source: 'syllabus',
    evidence: [
      {
        sentence:
          'AI collaboration is permitted exclusively for conceptual understanding, hint exploration, and rubric critique.',
        charStart: 125,
        charEnd: 236,
      },
    ],
    disclosureLog: [],
    studentConfirmed: true,
    extractionValid: true,
    validationErrors: [],
  };
}

