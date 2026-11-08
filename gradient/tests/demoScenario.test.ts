import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../extension/demoScenario.js';
import { currentGrade } from '../core/gradeModel.js';

describe('Synthetic hackathon context', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  it('reproduces overlapping unfinished deadlines and real structured briefs', () => {
    const snapshot = createDemoSnapshot('http://127.0.0.1:8085', now);
    const added = snapshot.courses.flatMap(course => course.assignments.filter(a => ['1091', '2091', '3091'].includes(a.id)));
    expect(added).toHaveLength(3);
    expect(added.filter(a => a.dueAt === '2026-11-10T23:59:00.000Z')).toHaveLength(2);
    expect(added.every(a => !a.submission && a.descriptionHtml.includes('SYNTHETIC HOMEWORK') && a.rubric?.length)).toBe(true);
    expect(snapshot.courses[0]?.resources.some(source => source.id === 'demo-graph-guide')).toBe(true);
    expect(snapshot).toEqual(createDemoSnapshot('http://127.0.0.1:8085', now));
  });
  it('keeps grade calculations model-free and source fixture values unchanged', () => {
    const snapshot = createDemoSnapshot('http://localhost:8085', now);
    for (const course of snapshot.courses) expect(course.currentScore).toBe(currentGrade(course.input).percentage);
    expect(snapshot.courses[0]?.assignments.find(a => a.id === '1001')?.submission?.score).toBe(95);
    snapshot.courses[0]!.assignments[0]!.name = 'Changed demo';
    expect(createDemoSnapshot('http://localhost:8085', now).courses[0]?.assignments[0]?.name).not.toBe('Changed demo');
  });
  it('always adds upcoming work relative to the selected demo day', () => {
    const future = createDemoSnapshot('http://localhost:8085', new Date('2028-06-01T10:00:00Z'));
    expect(future.courses[0]?.assignments.find(a => a.id === '1091')?.dueAt).toBe('2028-06-02T23:59:00.000Z');
  });
  it('cannot construct synthetic context on an institutional origin', () => {
    expect(() => createDemoSnapshot('https://school.instructure.com', now)).toThrow('localhost');
  });
});
