import { expect, it } from 'vitest';
import { syntheticCanvasTime } from '../extension/canvasTime.js';
import { createDemoSnapshot } from '../extension/demoScenario.js';
import { gradeInsight } from '../extension/gradeInsight.js';

it('charts a sample week of Canvas time against the marks that can still move', () => {
  const courses = createDemoSnapshot('http://127.0.0.1:8085', new Date('2026-11-09T18:00:00Z')).courses;
  const report = syntheticCanvasTime(courses.map(course => {
    const insight = gradeInsight(course);
    return { id: course.id, code: course.code, floor: insight.floor, ceiling: insight.ceiling };
  }), new Date('2026-11-09T18:00:00Z'));

  expect(report.days).toHaveLength(7);
  expect(report.days[6]?.label).toBe('Today');
  expect(report.days.find(day => day.weekday === 2)?.label).toBe('Tue');
  expect(report.days.find(day => day.weekday === 4)?.label).toBe('Thu');
  expect(report.total).toBe(21);
  expect(report.courses.map(course => [course.code, course.hours])).toEqual([
    ['CS-101', 10.5],
    ['MATH-201', 7],
    ['BIO-110', 3.5],
  ]);
  expect(round1(report.days.reduce((sum, day) => sum + day.total, 0))).toBe(21);
  expect(round1(report.courses.reduce((sum, course) => sum + course.hours, 0))).toBe(21);
  expect(report.days.find(day => day.weekday === 6)?.slices[0]?.hours).toBe(0);
  expect(report.days.find(day => day.weekday === 6)?.aria).toContain('1.0 hours in total');
  expect(report.days.find(day => day.weekday === 4)?.aria).toContain('4.0 hours in total');
  expect(report.note).toBe('CS-101 took 10.5 of those hours, and its final mark can still move the furthest, 46.8 points.');
  expect(report.aside).toBe('BIO-110 got 3.5 hours, with 3.5 points of room left.');
});

function round1(value: number): number {
  return Number(value.toFixed(1));
}
