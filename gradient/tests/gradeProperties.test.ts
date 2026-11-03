import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  currentGrade,
  determineDroppedAssignments,
  computeCanvasGrade,
  type CourseData,
} from '../core/gradeModel.js';
import {
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
} from '../core/schema.js';

describe('Property-Based Tests for Grade Model (fast-check)', () => {
  // -------------------------------------------------------------------------
  // Property 1: Score Monotonicity
  // -------------------------------------------------------------------------
  it('Property 1: Grade is monotonically non-decreasing in any single assignment score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 200 }), // points possible
        fc.float({ min: 0, max: 100, noNaN: true }), // score 1
        fc.float({ min: 0, max: 100, noNaN: true }), // score 2
        (pointsPossible, s1, s2) => {
          const lowerScore = Math.min(s1, s2);
          const higherScore = Math.max(s1, s2);

          const course = CourseSchema.parse({
            id: 'c1',
            name: 'Monotonicity Test',
            creditHours: 3.0,
            applyGroupWeights: false,
          });
          const groups = [AssignmentGroupSchema.parse({ id: 'g1', name: 'Group 1', weight: 100 })];
          const assignments = [
            AssignmentSchema.parse({ id: 'a1', groupId: 'g1', name: 'A1', pointsPossible }),
            AssignmentSchema.parse({ id: 'a2', groupId: 'g1', name: 'A2', pointsPossible: 100 }),
          ];

          // Baseline submission for A2
          const baseSubA2 = SubmissionSchema.parse({ assignmentId: 'a2', score: 80, posted: true });

          // Grade with lower score
          const dataLower: CourseData = {
            course,
            groups,
            assignments,
            submissions: [
              SubmissionSchema.parse({ assignmentId: 'a1', score: lowerScore, posted: true }),
              baseSubA2,
            ],
          };
          const gradeLower = currentGrade(dataLower).percentage!;

          // Grade with higher score
          const dataHigher: CourseData = {
            course,
            groups,
            assignments,
            submissions: [
              SubmissionSchema.parse({ assignmentId: 'a1', score: higherScore, posted: true }),
              baseSubA2,
            ],
          };
          const gradeHigher = currentGrade(dataHigher).percentage!;

          // Property assertion: s_higher >= s_lower ==> Grade_higher >= Grade_lower
          expect(gradeHigher).toBeGreaterThanOrEqual(gradeLower);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 2: Dropping Lowest Never Lowers Group Score
  // -------------------------------------------------------------------------
  it('Property 2: Dropping the lowest score never lowers a group percentage', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 8 }),
            score: fc.float({ min: 0, max: 100, noNaN: true }),
            possible: fc.constant(100),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (rawItems) => {
          const items = rawItems.map((r, i) => ({
            assignmentId: `assign_${i}`,
            name: `Assign ${i}`,
            score: r.score,
            pointsPossible: r.possible,
            isNeverDrop: false,
          }));

          // Without drop
          const resNoDrop = determineDroppedAssignments(items, { dropLowest: 0, dropHighest: 0, neverDrop: [] });
          const sumNoDropEarned = resNoDrop.kept.reduce((a, b) => a + b.score, 0);
          const sumNoDropPoss = resNoDrop.kept.reduce((a, b) => a + b.pointsPossible, 0);
          const pctNoDrop = sumNoDropPoss > 0 ? (sumNoDropEarned / sumNoDropPoss) * 100 : 0;

          // With dropLowest: 1
          const resWithDrop = determineDroppedAssignments(items, { dropLowest: 1, dropHighest: 0, neverDrop: [] });
          const sumWithDropEarned = resWithDrop.kept.reduce((a, b) => a + b.score, 0);
          const sumWithDropPoss = resWithDrop.kept.reduce((a, b) => a + b.pointsPossible, 0);
          const pctWithDrop = sumWithDropPoss > 0 ? (sumWithDropEarned / sumWithDropPoss) * 100 : 0;

          // Dropping lowest score must never lower the group percentage
          expect(pctWithDrop).toBeGreaterThanOrEqual(pctNoDrop - 0.0001);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 3: Weights Summing to 100 Invariant (Uniform Score)
  // -------------------------------------------------------------------------
  it('Property 3: Weights summing to 100 with uniform percentage X% yields exactly X%', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }), // uniform percentage X
        fc.integer({ min: 1, max: 99 }), // weight of group 1
        (uniformPct, w1) => {
          const w2 = 100 - w1; // w1 + w2 = 100

          const course = CourseSchema.parse({
            id: 'c_weights',
            name: 'Weight Test',
            creditHours: 3.0,
            applyGroupWeights: true,
          });

          const groups = [
            AssignmentGroupSchema.parse({ id: 'g1', name: 'Group 1', weight: w1 }),
            AssignmentGroupSchema.parse({ id: 'g2', name: 'Group 2', weight: w2 }),
          ];

          const assignments = [
            AssignmentSchema.parse({ id: 'a1', groupId: 'g1', name: 'A1', pointsPossible: 100 }),
            AssignmentSchema.parse({ id: 'a2', groupId: 'g2', name: 'A2', pointsPossible: 50 }),
          ];

          // Score assignments at exact uniformPct
          const submissions = [
            SubmissionSchema.parse({ assignmentId: 'a1', score: (100 * uniformPct) / 100, posted: true }),
            SubmissionSchema.parse({ assignmentId: 'a2', score: (50 * uniformPct) / 100, posted: true }),
          ];

          const res = computeCanvasGrade(course, groups, assignments, submissions, { roundingDecimals: 4 });
          const expected = Math.round(uniformPct * 10000) / 10000;
          expect(Math.abs((res.percentage ?? 0) - expected)).toBeLessThanOrEqual(0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 4: Excused Item Isolation
  // -------------------------------------------------------------------------
  it('Property 4: Removing or excusing an item in Group 1 never changes Group 2 scores', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 50, noNaN: true }),
        (scoreG1, scoreG2) => {
          const course = CourseSchema.parse({
            id: 'c_iso',
            name: 'Isolation Test',
            creditHours: 3.0,
            applyGroupWeights: true,
          });

          const groups = [
            AssignmentGroupSchema.parse({ id: 'g1', name: 'Group 1', weight: 50 }),
            AssignmentGroupSchema.parse({ id: 'g2', name: 'Group 2', weight: 50 }),
          ];

          const assignments = [
            AssignmentSchema.parse({ id: 'a1', groupId: 'g1', name: 'A1', pointsPossible: 100 }),
            AssignmentSchema.parse({ id: 'a2', groupId: 'g2', name: 'A2', pointsPossible: 50 }),
          ];

          // Scenario A: A1 is graded
          const dataGraded: CourseData = {
            course,
            groups,
            assignments,
            submissions: [
              SubmissionSchema.parse({ assignmentId: 'a1', score: scoreG1, posted: true, excused: false }),
              SubmissionSchema.parse({ assignmentId: 'a2', score: scoreG2, posted: true }),
            ],
          };
          const resGraded = currentGrade(dataGraded);
          const g2Graded = resGraded.groups.find((g) => g.groupId === 'g2')!;

          // Scenario B: A1 is excused
          const dataExcused: CourseData = {
            course,
            groups,
            assignments,
            submissions: [
              SubmissionSchema.parse({ assignmentId: 'a1', score: scoreG1, posted: true, excused: true }),
              SubmissionSchema.parse({ assignmentId: 'a2', score: scoreG2, posted: true }),
            ],
          };
          const resExcused = currentGrade(dataExcused);
          const g2Excused = resExcused.groups.find((g) => g.groupId === 'g2')!;

          // Group 2 points earned, points possible, and percentage must be 100% IDENTICAL
          expect(g2Excused.pointsEarned).toBe(g2Graded.pointsEarned);
          expect(g2Excused.pointsPossible).toBe(g2Graded.pointsPossible);
          expect(g2Excused.percentage).toBe(g2Graded.percentage);
        }
      ),
      { numRuns: 100 }
    );
  });
});

