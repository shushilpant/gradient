import { expect, it } from 'vitest';
import { inferTaskType } from '../core/optimiserPriors.js';

it('uses the specific task title, then quiz submission type, then group name', () => {
  expect(inferTaskType('Homework: Graph traversal planning', ['online_upload'], 'Problem Sets')).toBe('homework');
  expect(inferTaskType('Midterm exam', ['online_quiz'], 'Quizzes')).toBe('exam');
  expect(inferTaskType('Reading check', ['online_quiz'], 'Exams')).toBe('quiz');
  expect(inferTaskType('Week 5', undefined, 'Problem Sets')).toBe('problem_set');
  expect(inferTaskType('HW4: Greedy algorithms')).toBe('homework');
  expect(inferTaskType('Quiz2')).toBe('quiz');
  expect(inferTaskType('Contest, projections, and biological pathways')).toBe('default');
});
