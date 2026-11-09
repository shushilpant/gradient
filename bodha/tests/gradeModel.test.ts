import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';
import {
  currentGrade,
  finalGrade,
  neededScoreForTarget,
  bestCase,
  worstCase,
  type CourseData,
} from '../core/gradeModel.js';

describe('Canvas Exact Grade Model & Multi-Course Oracle (Stage 3)', () => {
  const fixturesDir = path.resolve(__dirname, '../sandbox/fixtures');
  const allCoursesPath = path.join(fixturesDir, 'sandbox_all_courses.json');
  const adapter = new CanvasAdapter();

  it('reproduces Canvas computed current and final scores across ALL sandbox courses within 0.01%', () => {
    expect(fs.existsSync(allCoursesPath)).toBe(true);
    const bundle: Array<{
      course: any;
      assignment_groups: any[];
      assignments: any[];
      submissions: any[];
      enrollment: any;
    }> = JSON.parse(fs.readFileSync(allCoursesPath, 'utf8'));

    expect(bundle.length).toBeGreaterThanOrEqual(3);

    console.log('\n' + '='.repeat(100));
    console.log('CANVAS GRADE MODEL CORRECTNESS ORACLE: PER-COURSE VERIFICATION TABLE');
    console.log('='.repeat(100));
    console.log(
      `${'Course Code'.padEnd(12)} | ${'Canvas Curr'.padEnd(12)} | ${'OffCanvas Curr'.padEnd(14)} | ${'Curr Diff'.padEnd(10)} | ${'Canvas Final'.padEnd(13)} | ${'OffCanvas Final'.padEnd(15)} | ${'Final Diff'.padEnd(11)} | ${'Status'}`
    );
    console.log('-'.repeat(100));

    for (const item of bundle) {
      const course = adapter.parseCourse(item.course, 4.0);
      const groups = adapter.parseAssignmentGroups(item.assignment_groups);
      const assignments = adapter.parseAssignments(item.assignments);
      const submissions = adapter.parseSubmissions(item.submissions);

      const courseData: CourseData = { course, groups, assignments, submissions };

      const computedCurrent = currentGrade(courseData);
      const computedFinal = finalGrade(courseData);

      const canvasCurrent = Number(item.enrollment?.computed_current_score ?? 0);
      const canvasFinal = Number(item.enrollment?.computed_final_score ?? 0);

      const currDiff = Math.abs((computedCurrent.percentage ?? 0) - canvasCurrent);
      const finalDiff = Math.abs((computedFinal.percentage ?? 0) - canvasFinal);

      const isCurrMatch = currDiff <= 0.01;
      const isFinalMatch = finalDiff <= 0.01;
      const status = isCurrMatch && isFinalMatch ? '✅ MATCH' : '❌ MISMATCH';

      const codeStr = (course.name.split(':')[0] ?? course.id).padEnd(12);
      const cCurrStr = (canvasCurrent.toFixed(2) + '%').padEnd(12);
      const gCurrStr = (((computedCurrent.percentage ?? 0).toFixed(2)) + '%').padEnd(14);
      const dCurrStr = (currDiff.toFixed(2) + '%').padEnd(10);
      const cFinStr = (canvasFinal.toFixed(2) + '%').padEnd(13);
      const gFinStr = (((computedFinal.percentage ?? 0).toFixed(2)) + '%').padEnd(15);
      const dFinStr = (finalDiff.toFixed(2) + '%').padEnd(11);

      console.log(
        `${codeStr} | ${cCurrStr} | ${gCurrStr} | ${dCurrStr} | ${cFinStr} | ${gFinStr} | ${dFinStr} | ${status}`
      );

      // Verify tolerance <= 0.01 percentage points
      expect(currDiff).toBeLessThanOrEqual(0.01);
      expect(finalDiff).toBeLessThanOrEqual(0.01);

      // Verify letter grades match Canvas
      if (item.enrollment?.computed_current_grade) {
        expect(computedCurrent.letterGrade).toBe(item.enrollment.computed_current_grade);
      }
      if (item.enrollment?.computed_final_grade) {
        expect(computedFinal.letterGrade).toBe(item.enrollment.computed_final_grade);
      }
    }
    console.log('='.repeat(100) + '\n');
  });

  it('calculates neededScoreForTarget accurately', () => {
    const rawCourse = {
      id: 'cs101',
      name: 'CS 101',
      creditHours: 4.0,
      applyGroupWeights: false,
    };
    const course = adapter.parseCourse(rawCourse, 4.0);
    const groups = adapter.parseAssignmentGroups([{ id: 1, name: 'General', group_weight: 100 }]);
    const assignments = adapter.parseAssignments([
      { id: 1, assignment_group_id: 1, name: 'HW 1', points_possible: 100 },
      { id: 2, assignment_group_id: 1, name: 'HW 2', points_possible: 100 },
    ]);
    const submissions = adapter.parseSubmissions([
      { assignment_id: 1, score: 80, posted_at: '2026-10-01T00:00:00Z' },
      { assignment_id: 2, score: null, posted_at: null }, // Unsubmitted HW 2
    ]);

    const courseData: CourseData = { course, groups, assignments, submissions };

    // To get 90% overall across two 100-pt assignments (80 + x) / 200 = 0.90 -> x = 100
    const targetA = neededScoreForTarget(courseData, 90.0, '2');
    expect(targetA.isAchievable).toBe(true);
    expect(targetA.neededScore).toBe(100.0);
    expect(targetA.neededPercentage).toBe(100.0);

    // Target 95%: requires (80 + x) / 200 = 0.95 -> x = 110 (requires extra credit)
    const targetHigh = neededScoreForTarget(courseData, 95.0, '2');
    expect(targetHigh.isAchievable).toBe(false);
    expect(targetHigh.neededScore).toBe(110.0);
    expect(targetHigh.reason).toContain('extra credit');

    // Target 30%: requires (80 + x) / 200 = 0.30 -> x = -20 -> already guaranteed (0 pts)
    const targetLow = neededScoreForTarget(courseData, 30.0, '2');
    expect(targetLow.isAchievable).toBe(true);
    expect(targetLow.neededScore).toBe(0.0);
    expect(targetLow.reason).toContain('guaranteed');
  });

  it('evaluates bestCase and worstCase scenarios cleanly', () => {
    const rawCourse = {
      id: 'math201',
      name: 'MATH 201',
      creditHours: 3.0,
      applyGroupWeights: false,
    };
    const course = adapter.parseCourse(rawCourse, 3.0);
    const groups = adapter.parseAssignmentGroups([{ id: 1, name: 'All', group_weight: 100 }]);
    const assignments = adapter.parseAssignments([
      { id: 1, assignment_group_id: 1, name: 'Midterm', points_possible: 100 },
      { id: 2, assignment_group_id: 1, name: 'Final', points_possible: 100 },
    ]);
    const submissions = adapter.parseSubmissions([
      { assignment_id: 1, score: 90, posted_at: '2026-10-01T00:00:00Z' },
      // Final is pending unsubmitted
    ]);

    const courseData: CourseData = { course, groups, assignments, submissions };

    const curr = currentGrade(courseData);
    const worst = worstCase(courseData);
    const best = bestCase(courseData);

    // Current: 90 / 100 = 90.0%
    expect(curr.percentage).toBe(90.0);

    // Worst: 90 + 0 / 200 = 45.0%
    expect(worst.percentage).toBe(45.0);

    // Best: 90 + 100 / 200 = 95.0%
    expect(best.percentage).toBe(95.0);

    expect(worst.percentage!).toBeLessThanOrEqual(curr.percentage!);
    expect(curr.percentage!).toBeLessThanOrEqual(best.percentage!);
  });
});
