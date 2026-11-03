import { describe, it, expect } from 'vitest';
import {
  mineRecurringWeaknesses,
  getRelevantWeaknessesForAssignment,
} from '../core/feedbackMining.js';
import { type CourseOptimizationInput } from '../core/optimiser.js';
import { type RubricCriterion } from '../core/schema.js';

describe('Stage 7: Historical Feedback Mining Engine', () => {
  const sampleCourses: CourseOptimizationInput[] = [
    {
      course: {
        id: '99001',
        name: 'CS 101: Introduction to Algorithms',
        creditHours: 4.0,
        applyGroupWeights: true,
        gradingScheme: [],
        gradePointScale: {},
      },
      groups: [],
      assignments: [
        {
          id: '1001',
          groupId: 'g1',
          name: 'HW 1: Big-O Complexity',
          pointsPossible: 100,
          submissionTypes: ['online_upload'],
          omitFromFinalGrade: false,
          hasRubric: true,
          rubric: [
            {
              id: 'crit_1_1',
              description: 'Asymptotic Analysis & Big-O',
              points: 50,
              ratings: [],
            },
            {
              id: 'crit_1_2',
              description: 'Code Modularity & Clean Code',
              points: 50,
              ratings: [],
            },
          ],
        },
        {
          id: '1002',
          groupId: 'g1',
          name: 'HW 2: Divide & Conquer',
          pointsPossible: 100,
          submissionTypes: ['online_upload'],
          omitFromFinalGrade: false,
          hasRubric: true,
          rubric: [
            {
              id: 'crit_2_1',
              description: 'Recurrence Relations & Proofs',
              points: 50,
              ratings: [],
            },
            {
              id: 'crit_2_2',
              description: 'Algorithmic Complexity & Edge Cases',
              points: 50,
              ratings: [],
            },
          ],
        },
      ],
      submissions: [
        {
          assignmentId: '1001',
          score: 85,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'graded',
          rubricAssessment: {
            crit_1_1: {
              points: 35,
              comments: 'Lost points on tight asymptotic upper bound.',
            },
            crit_1_2: {
              points: 50,
              comments: 'Clean modular architecture.',
            },
          },
        },
        {
          assignmentId: '1002',
          score: 70,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'graded',
          rubricAssessment: {
            crit_2_1: {
              points: 35,
              comments: 'Recurrence proof omitted base cases.',
            },
            crit_2_2: {
              points: 35,
              comments: 'Failed to test empty input edge cases.',
            },
          },
        },
      ],
    },
    {
      course: {
        id: '99002',
        name: 'MATH 201: Discrete Mathematics',
        creditHours: 3.0,
        applyGroupWeights: false,
        gradingScheme: [],
        gradePointScale: {},
      },
      groups: [],
      assignments: [
        {
          id: '2001',
          groupId: 'g2',
          name: 'Problem Set 1: Induction',
          pointsPossible: 50,
          submissionTypes: ['online_upload'],
          omitFromFinalGrade: false,
          hasRubric: true,
          rubric: [
            {
              id: 'crit_m_1',
              description: 'Mathematical Induction Proof',
              points: 50,
              ratings: [],
            },
          ],
        },
      ],
      submissions: [
        {
          assignmentId: '2001',
          score: 30,
          excused: false,
          missing: false,
          late: false,
          posted: true,
          workflowState: 'graded',
          rubricAssessment: {
            crit_m_1: {
              points: 30,
              comments: 'Inductive step algebra had minor flaws.',
            },
          },
        },
      ],
    },
  ];

  it('mines and ranks recurring weaknesses across multiple courses', () => {
    const weaknesses = mineRecurringWeaknesses(sampleCourses);

    expect(weaknesses.length).toBeGreaterThan(0);

    // Verify Mathematical Rigor cluster
    const mathWeakness = weaknesses.find((w) =>
      w.topic.includes('Mathematical Rigor & Proof Structure')
    );
    expect(mathWeakness).toBeDefined();
    // 2 assignments lost points on math proofs (HW 2 crit_2_1 and Problem Set 1 crit_m_1)
    expect(mathWeakness?.frequency).toBe(2);
    expect(mathWeakness?.totalPointsLost).toBe(35); // 15 pts + 20 pts
    expect(mathWeakness?.underlyingData).toHaveLength(2);

    // Verify Algorithmic Complexity cluster
    const algoWeakness = weaknesses.find((w) =>
      w.topic.includes('Algorithmic Complexity & Edge Cases')
    );
    expect(algoWeakness).toBeDefined();
    expect(algoWeakness?.frequency).toBe(2);
    expect(algoWeakness?.totalPointsLost).toBe(30); // 15 pts + 15 pts

    // Weaknesses should be sorted by severity/totalPointsLost descending
    expect(weaknesses[0]?.totalPointsLost).toBeGreaterThanOrEqual(
      weaknesses[1]?.totalPointsLost ?? 0
    );
  });

  it('matches relevant historical weaknesses to upcoming assignment rubric criteria', () => {
    const weaknesses = mineRecurringWeaknesses(sampleCourses);

    const upcomingRubric: RubricCriterion[] = [
      {
        id: 'crit_final_1',
        description: 'Algorithmic Complexity & Edge Case Testing',
        points: 40,
        ratings: [],
      },
    ];

    const matched = getRelevantWeaknessesForAssignment(upcomingRubric, weaknesses);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.topic).toContain('Algorithmic Complexity');
  });

  it('returns empty array when upcoming assignment does not match historical weaknesses', () => {
    const weaknesses = mineRecurringWeaknesses(sampleCourses);

    const unrelatedRubric: RubricCriterion[] = [
      {
        id: 'crit_oral_1',
        description: 'Oral Presentation Eye Contact',
        points: 20,
        ratings: [],
      },
    ];

    const matched = getRelevantWeaknessesForAssignment(unrelatedRubric, weaknesses);
    expect(matched).toHaveLength(0);
  });

  it('mines recurring weaknesses directly from the sandbox fixture courses', async () => {
    const { getFixtureCourses } = await import('../extension/fixtureData.js');
    const fixtureCourses = getFixtureCourses();
    const weaknesses = mineRecurringWeaknesses(fixtureCourses);
    expect(weaknesses.length).toBeGreaterThan(0);
    expect(weaknesses[0]?.totalPointsLost).toBeGreaterThan(0);
    expect(weaknesses.some((w) => w.frequency > 0)).toBe(true);
  });
});
