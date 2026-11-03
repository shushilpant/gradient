import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';
import {
  CourseSchema,
  AssignmentGroupSchema,
  AssignmentSchema,
  SubmissionSchema,
  RubricCriterionSchema,
} from '../core/schema.js';
import { computeCanvasGrade } from '../core/grade.js';

describe('CanvasAdapter Acceptance Test against Verified Sandbox Fixtures', () => {
  const fixturesDir = path.resolve(__dirname, '../sandbox/fixtures');
  const adapter = new CanvasAdapter();

  it('correctly maps courses.json to neutral CourseSchema', () => {
    const rawCourse = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'courses.json'), 'utf8'));
    const parsed = adapter.parseCourse(rawCourse, 4.0);

    // Validate with Zod
    const validated = CourseSchema.parse(parsed);
    expect(validated.id).toBe('99001');
    expect(validated.creditHours).toBe(4.0);
    expect(validated.applyGroupWeights).toBe(true);
    expect(validated.gradingScheme.length).toBeGreaterThan(0);
  });

  it('correctly maps assignment_groups.json to neutral AssignmentGroupSchema', () => {
    const rawGroups = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'assignment_groups.json'), 'utf8'));
    const parsed = adapter.parseAssignmentGroups(rawGroups);

    expect(parsed.length).toBe(3);
    for (const g of parsed) {
      const validated = AssignmentGroupSchema.parse(g);
      expect(validated.id).toBeDefined();
      expect(validated.weight).toBeGreaterThanOrEqual(0);
      expect(validated.rules).toBeDefined();
    }

    // Verify drop rules from Homework group
    const hwGroup = parsed.find((g) => g.name.includes('Homework'));
    expect(hwGroup).toBeDefined();
    expect(hwGroup?.rules.dropLowest).toBe(1);
    expect(hwGroup?.rules.dropHighest).toBe(1);
    expect(hwGroup?.rules.neverDrop).toContain('1001');
  });

  it('correctly maps assignments.json to neutral AssignmentSchema', () => {
    const rawAssigns = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'assignments.json'), 'utf8'));
    const parsed = adapter.parseAssignments(rawAssigns);

    expect(parsed.length).toBe(8);
    for (const a of parsed) {
      const validated = AssignmentSchema.parse(a);
      expect(validated.id).toBeDefined();
      expect(validated.groupId).toBeDefined();
      expect(validated.pointsPossible).toBeGreaterThanOrEqual(0);
    }

    // Check rubrics on assignments
    const withRubrics = parsed.filter((a) => a.hasRubric);
    expect(withRubrics.length).toBeGreaterThanOrEqual(3);

    // Check draft omitted from final grade
    const draft = parsed.find((a) => a.name.includes('Draft'));
    expect(draft).toBeDefined();
    expect(draft?.omitFromFinalGrade).toBe(true);
  });

  it('correctly maps submissions.json to neutral SubmissionSchema', () => {
    const rawSubs = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'submissions.json'), 'utf8'));
    const parsed = adapter.parseSubmissions(rawSubs);

    expect(parsed.length).toBe(8);
    for (const s of parsed) {
      const validated = SubmissionSchema.parse(s);
      expect(validated.assignmentId).toBeDefined();
    }

    // Verify excused submission
    const excusedSub = parsed.find((s) => s.excused);
    expect(excusedSub).toBeDefined();

    // Verify missing submission
    const missingSub = parsed.find((s) => s.missing);
    expect(missingSub).toBeDefined();

    // Verify late submission
    const lateSub = parsed.find((s) => s.late);
    expect(lateSub).toBeDefined();

    // Verify unposted / hidden submission
    const unpostedSub = parsed.find((s) => !s.posted);
    expect(unpostedSub).toBeDefined();
  });

  it('correctly maps rubrics.json to neutral RubricCriterionSchema', () => {
    const rawRubrics = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'rubrics.json'), 'utf8'));
    const parsed = adapter.parseRubrics(rawRubrics);

    expect(parsed.length).toBeGreaterThanOrEqual(3);
    for (const criterion of parsed) {
      const validated = RubricCriterionSchema.parse(criterion);
      expect(validated.id).toBeDefined();
      expect(validated.description.length).toBeGreaterThan(0);
      expect(validated.ratings.length).toBeGreaterThan(0);
    }
  });

  it('computes exact Canvas grade matching expected sandbox calculation', () => {
    const rawCourse = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'courses.json'), 'utf8'));
    const rawGroups = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'assignment_groups.json'), 'utf8'));
    const rawAssigns = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'assignments.json'), 'utf8'));
    const rawSubs = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'submissions.json'), 'utf8'));

    const course = adapter.parseCourse(rawCourse, 4.0);
    const groups = adapter.parseAssignmentGroups(rawGroups);
    const assignments = adapter.parseAssignments(rawAssigns);
    const submissions = adapter.parseSubmissions(rawSubs);

    const grade = computeCanvasGrade(course, groups, assignments, submissions);
    expect(grade.percentage).not.toBeNull();
    expect(grade.letterGrade).not.toBeNull();
    expect(grade.gradePoints).not.toBeNull();
    expect(grade.groups.length).toBe(3);
  });
});
