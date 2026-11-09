import { expect, it } from 'vitest';
import { createDemoSnapshot } from '../extension/demoScenario.js';
import { gradeInsight } from '../extension/gradeInsight.js';

it('tells which rebuilt marks can still reach an A and which can collapse', () => {
  const courses = createDemoSnapshot('http://127.0.0.1:8085', new Date('2026-11-09T12:00:00Z')).courses;
  const insight = Object.fromEntries(courses.map(course => [course.code, gradeInsight(course)]));

  expect(insight['CS-101']?.climb).toBe('2.3 points short of an A');
  expect(insight['CS-101']?.stakes).toBe('Final mark can still land from 94.6% to 47.8%, down to an F');
  expect(insight['CS-101']?.matchesCanvas).toBe(true);
  expect(insight['MATH-201']?.climb).toBe('1.7 points short of an A');
  expect(insight['MATH-201']?.stakes).toContain('down to an F');
  expect(insight['BIO-110']?.climb).toBe('An A is out of reach');
  expect(insight['BIO-110']?.stakes).toBe('Final mark can still land from 91.7% to 88.2%, down to a B+');
});
