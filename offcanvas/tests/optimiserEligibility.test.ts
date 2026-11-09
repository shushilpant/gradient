import { describe, expect, it } from 'vitest';
import { optimizeEffort, type CourseOptimizationInput } from '../core/optimiser.js';
import { finalGrade } from '../core/gradeModel.js';
import { CanvasAdapter } from '../extension/adapter/canvasAdapter.js';

const adapter = new CanvasAdapter();
function course(): CourseOptimizationInput {
  return {
    course: { ...adapter.parseCourse({ id: 1, name: 'Live course' }, 3),
      gradingScheme: [{ minPct: 40, letter: 'A' }, { minPct: 0, letter: 'F' }],
      gradePointScale: { A: 4, F: 0 },
    },
    groups: adapter.parseAssignmentGroups([{ id: 10, name: 'Assignments', rules: {} }]),
    assignments: adapter.parseAssignments(['posted', 'submitted', 'hidden', 'todo'].map(id => ({
      id, name: id, assignment_group_id: 10, points_possible: 100,
    }))),
    submissions: adapter.parseSubmissions([
      { assignment_id: 'posted', score: 100, workflow_state: 'graded', posted_at: '2026-11-01T12:00:00Z' },
      { assignment_id: 'submitted', score: null, workflow_state: 'submitted', posted_at: null },
      { assignment_id: 'hidden', score: 99, workflow_state: 'graded', posted_at: null },
      { assignment_id: 'todo', score: null, workflow_state: 'unsubmitted', posted_at: null },
    ]),
  };
}
const options = { capacityHours: 3, numSamples: 30, seed: 42, protectMastery: true, masteryFloorHours: .5, isRobustnessRun: true };

describe('Optimizer caller study eligibility', () => {
  it('never allocates study time to excluded submitted or hidden work', () => {
    const input = { ...course(), studyEligibleAssignmentIds: ['todo'] };
    const result = optimizeEffort([input], options);
    expect(result.recommendations.map(r => r.assignmentId)).toEqual(['todo']);
    expect(result.allocatedHours).toBeGreaterThan(0);
    expect(result.recommendations[0]?.allocatedHours).toBe(result.allocatedHours);
  });

  it('retains every assignment in grade denominators without inventing fixed scores', () => {
    const input = course();
    const original = structuredClone(input);
    const result = optimizeEffort([{ ...input, studyEligibleAssignmentIds: ['todo'] }], options);
    // 100 posted points / 400 possible = 25%, below this course's 40% A threshold.
    // Dropping excluded assignments would produce 50% and incorrectly start at an A.
    expect(finalGrade(input).percentage).toBe(25);
    expect(result.baselineExpectedGpa).toBe(0);
    expect(input).toEqual(original);
    expect(input.submissions.find(s => s.assignmentId === 'hidden')).toMatchObject({ score: 99, posted: false });
  });

  it('treats an empty allowlist as no study-eligible work', () => {
    const result = optimizeEffort([{ ...course(), studyEligibleAssignmentIds: [] }], options);
    expect(result.allocatedHours).toBe(0);
    expect(result.recommendations).toEqual([]);
    expect(result.baselineExpectedGpa).toBe(0);
  });

  it('preserves legacy allocation behavior when no allowlist is supplied', () => {
    const result = optimizeEffort([course()], options);
    const ids = result.recommendations.map(r => r.assignmentId);
    expect(ids).toContain('submitted');
    expect(ids).toContain('hidden');
    expect(ids).toContain('todo');
  });
});
