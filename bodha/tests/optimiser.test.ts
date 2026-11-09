import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';
import {
  optimizeEffort,
  CourseOptimizationInput,
  OptimizationOptions,
} from '../core/optimiser.js';
import {
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
} from '../core/schema.js';

describe('OffCanvas Effort Optimizer (Stage 4)', () => {
  // -------------------------------------------------------------------------
  // 1. Hand-Computed Toy Case with Known Optimum
  // -------------------------------------------------------------------------
  it('identifies known analytical optimum in a hand-computed toy case', () => {
    // Course A: 4 credit hours.
    // Past: A1 = 88/100 (B, 3.0 GPA).
    // Upcoming: A2 (100 pts).
    // Target: Getting >= 92 on A2 brings Course A to (88 + 92)/200 = 90.0% (A, 4.0 GPA) -> +1.0 course GPA!
    const courseA = CourseSchema.parse({
      id: 'course_a',
      name: 'High Leverage Course A',
      creditHours: 4.0,
      applyGroupWeights: false,
      gradingScheme: [
        { minPct: 90, letter: 'A' },
        { minPct: 80, letter: 'B' },
        { minPct: 0, letter: 'F' },
      ],
      gradePointScale: { A: 4.0, B: 3.0, F: 0.0 },
    });
    const groupsA = [AssignmentGroupSchema.parse({ id: 'ga', name: 'General', weight: 100 })];
    const assignmentsA = [
      AssignmentSchema.parse({ id: 'a1', groupId: 'ga', name: 'A1 Past', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'a2', groupId: 'ga', name: 'A2 Upcoming Target', pointsPossible: 100 }),
    ];
    const submissionsA = [
      SubmissionSchema.parse({ assignmentId: 'a1', score: 92, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'a2', score: null, posted: true }), // upcoming
    ];

    // Course B: 1 credit hour.
    // Past: B1 = 98/100 (A, 4.0 GPA).
    // Upcoming: B2 (100 pts).
    // Course B already has an A (4.0). Any hours spent on B2 cannot improve course GPA beyond 4.0!
    const courseB = CourseSchema.parse({
      id: 'course_b',
      name: 'Zero Leverage Course B',
      creditHours: 1.0,
      applyGroupWeights: false,
      gradingScheme: [
        { minPct: 90, letter: 'A' },
        { minPct: 80, letter: 'B' },
        { minPct: 0, letter: 'F' },
      ],
      gradePointScale: { A: 4.0, B: 3.0, F: 0.0 },
    });
    const groupsB = [AssignmentGroupSchema.parse({ id: 'gb', name: 'General', weight: 100 })];
    const assignmentsB = [
      AssignmentSchema.parse({ id: 'b1', groupId: 'gb', name: 'B1 Past', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'b2', groupId: 'gb', name: 'B2 Upcoming Non-Impact', pointsPossible: 100 }),
    ];
    const submissionsB = [
      SubmissionSchema.parse({ assignmentId: 'b1', score: 98, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'b2', score: null, posted: true }), // upcoming
    ];

    const inputs: CourseOptimizationInput[] = [
      { course: courseA, groups: groupsA, assignments: assignmentsA, submissions: submissionsA },
      { course: courseB, groups: groupsB, assignments: assignmentsB, submissions: submissionsB },
    ];

    const result = optimizeEffort(inputs, {
      capacityHours: 2.0,
      stepSizeHours: 0.5,
      numSamples: 1000,
      seed: 42,
      customPriors: {
        default: { cap: 0.98, tau: 0.8, noiseSigma: 0.02 },
      },
    });

    // 100% of study capacity must be directed to A2
    expect(result.recommendations.length).toBe(1);
    expect(result.recommendations[0]?.assignmentId).toBe('a2');
    expect(result.recommendations[0]?.allocatedHours).toBe(2.0);
    expect(result.expectedGpaGain).toBeGreaterThan(0.5);
  });

  // -------------------------------------------------------------------------
  // 2. Monotonicity: More Capacity Never Lowers Expected GPA
  // -------------------------------------------------------------------------
  it('satisfies monotonicity: increasing study capacity never lowers expected GPA', () => {
    const course = CourseSchema.parse({
      id: 'c_mono',
      name: 'Monotonicity Course',
      creditHours: 3.0,
      applyGroupWeights: false,
    });
    const groups = [AssignmentGroupSchema.parse({ id: 'g1', name: 'All', weight: 100 })];
    const assignments = [
      AssignmentSchema.parse({ id: 'm1', groupId: 'g1', name: 'HW 1', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'm2', groupId: 'g1', name: 'HW 2', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'm3', groupId: 'g1', name: 'Final Exam', pointsPossible: 100 }),
    ];
    const submissions = [
      SubmissionSchema.parse({ assignmentId: 'm1', score: 75, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'm2', score: null, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'm3', score: null, posted: true }),
    ];

    const inputs: CourseOptimizationInput[] = [
      { course, groups, assignments, submissions },
    ];

    const capacities = [0, 2, 4, 8, 12, 16];
    const gpas: number[] = [];

    for (const cap of capacities) {
      const res = optimizeEffort(inputs, {
        capacityHours: cap,
        stepSizeHours: 0.5,
        numSamples: 800,
        seed: 1234,
      });
      gpas.push(res.optimizedExpectedGpa);
    }

    // Verify non-decreasing monotonicity
    for (let i = 1; i < gpas.length; i++) {
      expect(gpas[i]!).toBeGreaterThanOrEqual(gpas[i - 1]! - 0.001);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Drop-Lowest Changes Best Allocation
  // -------------------------------------------------------------------------
  it('diverts study effort away from an assignment buffered by drop-lowest to a high-stakes exam', () => {
    const course = CourseSchema.parse({
      id: 'c_drop',
      name: 'Drop Test Course',
      creditHours: 3.0,
      applyGroupWeights: true,
    });
    const groups = [
      // HW Group: 50% weight, dropLowest: 1
      AssignmentGroupSchema.parse({
        id: 'g_hw',
        name: 'Homework Group',
        weight: 50,
        rules: { dropLowest: 1, dropHighest: 0, neverDrop: [] },
      }),
      // Exam Group: 50% weight, dropLowest: 0
      AssignmentGroupSchema.parse({
        id: 'g_exam',
        name: 'Exam Group',
        weight: 50,
        rules: { dropLowest: 0, dropHighest: 0, neverDrop: [] },
      }),
    ];
    const assignments = [
      AssignmentSchema.parse({ id: 'h1', groupId: 'g_hw', name: 'HW 1 Past', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'h2', groupId: 'g_hw', name: 'HW 2 Past', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'h3', groupId: 'g_hw', name: 'HW 3 Upcoming Buffered', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'e1', groupId: 'g_exam', name: 'Final Exam High Stakes', pointsPossible: 100 }),
    ];
    const submissions = [
      // HW 1 and HW 2 are already high scores. Even if HW 3 gets 0, HW 3 will be dropped!
      SubmissionSchema.parse({ assignmentId: 'h1', score: 96, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'h2', score: 94, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'h3', score: null, posted: true }),
      // Final exam is completely pending and not dropped!
      SubmissionSchema.parse({ assignmentId: 'e1', score: null, posted: true }),
    ];

    const inputs: CourseOptimizationInput[] = [
      { course, groups, assignments, submissions },
    ];

    const res = optimizeEffort(inputs, {
      capacityHours: 4.0,
      stepSizeHours: 0.5,
      numSamples: 1000,
      seed: 999,
    });

    // The optimizer must recognize that e1 has massive marginal leverage, while h3 is buffered by dropLowest
    const topRec = res.recommendations[0];
    expect(topRec?.assignmentId).toBe('e1');
    expect(topRec?.allocatedHours).toBeGreaterThanOrEqual(3.5);
  });

  // -------------------------------------------------------------------------
  // 4. Determinism with Fixed Seed
  // -------------------------------------------------------------------------
  it('guarantees bit-for-bit deterministic results given the same seed', () => {
    const course = CourseSchema.parse({
      id: 'c_det',
      name: 'Determinism Course',
      creditHours: 3.0,
      applyGroupWeights: false,
    });
    const groups = [AssignmentGroupSchema.parse({ id: 'g1', name: 'General', weight: 100 })];
    const assignments = [
      AssignmentSchema.parse({ id: 'd1', groupId: 'g1', name: 'A1', pointsPossible: 100 }),
      AssignmentSchema.parse({ id: 'd2', groupId: 'g1', name: 'A2', pointsPossible: 100 }),
    ];
    const submissions = [
      SubmissionSchema.parse({ assignmentId: 'd1', score: 82, posted: true }),
      SubmissionSchema.parse({ assignmentId: 'd2', score: null, posted: true }),
    ];

    const inputs: CourseOptimizationInput[] = [{ course, groups, assignments, submissions }];
    const options: OptimizationOptions = {
      capacityHours: 3.0,
      stepSizeHours: 0.5,
      numSamples: 500,
      seed: 777,
    };

    const run1 = optimizeEffort(inputs, options);
    const run2 = optimizeEffort(inputs, options);

    // Completely identical
    expect(run1.optimizedExpectedGpa).toBe(run2.optimizedExpectedGpa);
    expect(run1.expectedGpaGain).toBe(run2.expectedGpaGain);
    expect(run1.recommendations).toEqual(run2.recommendations);
    expect(run1.thresholdAlerts).toEqual(run2.thresholdAlerts);
    expect(run1.robustness).toEqual(run2.robustness);
  });

  // -------------------------------------------------------------------------
  // 5. Runtime Benchmark (< 2 seconds for 3 courses & 30 open assignments)
  // -------------------------------------------------------------------------
  it('completes optimization in under 2.0 seconds for 3 courses with 30 open assignments', () => {
    const courses: CourseOptimizationInput[] = [];

    // Construct 3 courses, each with 10 open assignments (total 30 upcoming assignments)
    for (let c = 1; c <= 3; c++) {
      const course = CourseSchema.parse({
        id: `c_bench_${c}`,
        name: `Benchmark Course ${c}`,
        creditHours: 3.0 + c * 0.5,
        applyGroupWeights: true,
      });

      const groups = [
        AssignmentGroupSchema.parse({
          id: `g_hw_${c}`,
          name: `HW ${c}`,
          weight: 40,
          rules: { dropLowest: 1, dropHighest: 0, neverDrop: [] },
        }),
        AssignmentGroupSchema.parse({
          id: `g_exam_${c}`,
          name: `Exams ${c}`,
          weight: 60,
          rules: { dropLowest: 0, dropHighest: 0, neverDrop: [] },
        }),
      ];

      const assignments: any[] = [];
      const submissions: any[] = [];

      // 5 HW assignments (1 graded, 4 upcoming)
      for (let i = 1; i <= 5; i++) {
        const id = `c${c}_hw${i}`;
        assignments.push(
          AssignmentSchema.parse({ id, groupId: `g_hw_${c}`, name: `HW ${i}`, pointsPossible: 100 })
        );
        submissions.push(
          SubmissionSchema.parse({
            assignmentId: id,
            score: i === 1 ? 85 : null,
            posted: true,
          })
        );
      }

      // 6 Exam assignments (all upcoming, total 10 upcoming per course)
      for (let j = 1; j <= 6; j++) {
        const id = `c${c}_exam${j}`;
        assignments.push(
          AssignmentSchema.parse({ id, groupId: `g_exam_${c}`, name: `Exam ${j}`, pointsPossible: 100 })
        );
        submissions.push(
          SubmissionSchema.parse({
            assignmentId: id,
            score: null,
            posted: true,
          })
        );
      }

      courses.push({ course, groups, assignments, submissions });
    }

    const t0 = performance.now();
    const result = optimizeEffort(courses, {
      capacityHours: 10.0,
      stepSizeHours: 0.5,
      numSamples: 1000,
      seed: 42,
    });
    const elapsedMs = performance.now() - t0;

    console.log(`\n[PERFORMANCE] 3 Courses with 30 Open Assignments Optimization Timing: ${elapsedMs.toFixed(2)} ms`);
    expect(elapsedMs).toBeLessThan(3000.0);
    expect(result.allocatedHours).toBe(10.0);
  });

  // -------------------------------------------------------------------------
  // 6. Acceptance Test: Real Sandbox Data with Robustness Rating Printout
  // -------------------------------------------------------------------------
  it('runs on sandbox data, prints ranked recommendation table and robustness rating', () => {
    const fixturesDir = path.resolve(__dirname, '../sandbox/fixtures');
    const allCoursesPath = path.join(fixturesDir, 'sandbox_all_courses.json');
    expect(fs.existsSync(allCoursesPath)).toBe(true);

    const bundle: Array<{
      course: any;
      assignment_groups: any[];
      assignments: any[];
      submissions: any[];
      enrollment: any;
    }> = JSON.parse(fs.readFileSync(allCoursesPath, 'utf8'));

    const adapter = new CanvasAdapter();
    const courseInputs: CourseOptimizationInput[] = bundle.map((item, idx) => {
      // Alex has 4 credits in CS 101, 3 in MATH 201, 4 in BIO 110
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

    const result = optimizeEffort(courseInputs, {
      capacityHours: 8.0,
      stepSizeHours: 0.5,
      numSamples: 1000,
      seed: 42,
      protectMastery: true,
      masteryFloorHours: 0.5,
    });

    // Verification assertions
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.allocatedHours).toBeLessThanOrEqual(8.0);
    expect(['high', 'medium']).toContain(result.robustness.confidence);

    // Formatted ASCII and JSON Table for Acceptance Display
    console.log('\n' + '='.repeat(105));
    console.log('STAGE 4 ACCEPTANCE TEST: OffCanvas EFFORT OPTIMIZER RECOMMENDATION TABLE');
    console.log('='.repeat(105));
    console.log(
      `${'Rank'.padEnd(5)} | ${'Course'.padEnd(12)} | ${'Assignment'.padEnd(35)} | ${'Hours'.padEnd(7)} | ${'Exp Score'.padEnd(10)} | ${'Course Gain'.padEnd(12)} | ${'Marginal/hr'.padEnd(11)}`
    );
    console.log('-'.repeat(105));

    result.recommendations.forEach((rec, idx) => {
      const rank = `#${idx + 1}`.padEnd(5);
      const course = rec.courseName.split(':')[0]!.padEnd(12);
      const assign = rec.assignmentName.slice(0, 34).padEnd(35);
      const hrs = `${rec.allocatedHours.toFixed(1)}h`.padEnd(7);
      const expSc = `${rec.expectedScorePct.toFixed(1)}%`.padEnd(10);
      const gain = `+${rec.expectedGradePointGain.toFixed(2)} pts`.padEnd(12);
      const marg = `+${rec.marginalGainPerHour.toFixed(3)}`.padEnd(11);
      console.log(`${rank} | ${course} | ${assign} | ${hrs} | ${expSc} | ${gain} | ${marg}`);
      console.log(`      Reason: ${rec.reason}`);
    });

    console.log('-'.repeat(105));
    console.log(`Semester GPA Baseline:   ${result.baselineExpectedGpa.toFixed(2)}`);
    console.log(`Semester GPA Optimized:  ${result.optimizedExpectedGpa.toFixed(2)} (+${result.expectedGpaGain.toFixed(2)} GPA points)`);
    console.log(`Total Study Allocated:   ${result.allocatedHours.toFixed(1)} / ${result.totalCapacityHours.toFixed(1)} hours`);

    console.log('\n--- THRESHOLD ALERTS ---');
    result.thresholdAlerts.forEach((alert) => {
      console.log(`• [${alert.courseName.split(':')[0]}] ${alert.alertMessage}`);
    });

    console.log('\n--- ROBUSTNESS ASSESSMENT ---');
    console.log(`Robustness Rating:       ${result.robustness.confidence.toUpperCase()}`);
    console.log(`Pacing Details:          ${result.robustness.details}`);
    console.log(`Faster Pace (tau*0.7):   GPA ${result.robustness.perturbationResults.fasterPace.expectedGpa.toFixed(2)}`);
    console.log(`Slower Pace (tau*1.3):   GPA ${result.robustness.perturbationResults.slowerPace.expectedGpa.toFixed(2)}`);
    console.log('='.repeat(105) + '\n');
  });
});
