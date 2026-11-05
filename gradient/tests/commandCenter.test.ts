import { describe, it, expect } from 'vitest';
import type { CanvasSnapshot, CanvasCourseSnapshot, CanvasLiveAssignment } from '../extension/liveCanvas.js';
import { parseCommand, planMission, missionCalendar, missionTasks, snapshotBaseline, detectMissionChanges, accountKey, searchCoursework } from '../extension/commandCenter.js';

function fixture(): CanvasSnapshot {
  const assignment = { id: 'a1', name: 'Biology worksheet', groupId: 'g1', pointsPossible: 100, dueAt: '2026-11-06T20:00:00Z', descriptionHtml: '<p>Explain mitosis.</p>', htmlUrl: 'https://canvas.example/courses/c1/assignments/a1', submission: null, submissionTypes: [], omitFromFinalGrade: false, hasRubric: false } satisfies CanvasLiveAssignment;
  const course = { id: 'c1', name: 'Biology', code: 'BIO 110', assignments: [assignment], resources: [{ id: 'r1', title: 'Mitosis lecture', url: 'https://canvas.example/courses/c1/pages/mitosis', type: 'page' }], announcements: [], calendarEvents: [] } as unknown as CanvasCourseSnapshot;
  return { origin: 'https://canvas.example', user: { id: 'u1', name: 'Alex', shortName: 'Alex' }, syncedAt: '2026-11-05T14:00:00Z', courses: [course], issues: [] };
}
describe('Command center', () => {
  it.each([
    ['Prepare me for biology in 2 hours', 'prepare', 120],
    ['Actually I only have 40 minutes', 'resize', 40],
    ['I have 25 minutes. Get me started', 'focus', 25],
    ['Brief me for today', 'briefing', undefined],
    ['Find the lecture where we covered mitosis', 'search', undefined],
    ['Explain what I’m looking at', 'explain', undefined],
    ['Check my explanation: cells divide', 'teach', undefined],
    ['Move tonight’s study session to tomorrow', 'move', undefined],
    ['Remember I prefer visual explanations', 'remember', undefined],
    ['Stop', 'stop', undefined],
  ])('routes %s', (input, intent, minutes) => {
    expect(parseCommand(input)).toMatchObject({ intent, minutes });
  });
  it('bounds duration and leaves unsupported commands explicit', () => {
    expect(parseCommand('focus for 500 hours').minutes).toBe(480);
    expect(parseCommand('email my professor').intent).toBe('help');
  });
  it('does not invent search results or return submitted work as a mission', () => {
    const snapshot = fixture();
    expect(searchCoursework(snapshot, 'mitosis')[0]?.title).toBe('Mitosis lecture');
    expect(searchCoursework(snapshot, 'eigenvectors')).toEqual([]);
    snapshot.courses[0]!.assignments[0]!.submission = { assignmentId: 'a1', score: null, workflowState: 'submitted', excused: false, missing: false, late: false, posted: false };
    expect(missionTasks(snapshot)).toEqual([]);
  });
  it('avoids busy blocks, respects deadlines, and preserves completed work', () => {
    const snapshot = fixture();
    const start = new Date(2026, 10, 5, 9, 0);
    snapshot.courses[0]!.assignments[0]!.dueAt = new Date(2026, 10, 5, 10, 0).toISOString();
    snapshot.courses[0]!.calendarEvents = [{ id: 'busy', title: 'Class', startAt: start.toISOString(), endAt: new Date(2026, 10, 5, 9, 30).toISOString(), url: '' }];
    const result = planMission(missionTasks(snapshot, start.getTime()), 90, snapshot, [], start);
    expect(result.blocks).toHaveLength(1);
    expect(new Date(result.blocks[0]!.start).getMinutes()).toBe(30);
    expect(result.unscheduledMinutes).toBe(65);
    const completed = { ...result.blocks[0]!, completed: true };
    const replan = planMission(missionTasks(snapshot, start.getTime()), 40, snapshot, [completed], start);
    expect(replan.blocks[0]).toEqual(completed);
    expect(replan.blocks.filter(block => !block.completed)).toHaveLength(0);
  });
  it('moves nighttime work to morning and reports impossible budgets', () => {
    const snapshot = fixture();
    const start = new Date(2026, 10, 5, 23, 0);
    snapshot.courses[0]!.assignments[0]!.dueAt = new Date(2026, 10, 7, 20).toISOString();
    const result = planMission(missionTasks(snapshot), 40, snapshot, [], start);
    expect(new Date(result.blocks[0]!.start).getHours()).toBe(8);
    expect(new Date(result.blocks[0]!.start).getDate()).toBe(6);
    expect(result.unscheduledMinutes).toBe(0);
    snapshot.courses[0]!.assignments[0]!.dueAt = new Date(2026, 10, 6, 7).toISOString();
    expect(planMission(missionTasks(snapshot), 40, snapshot, [], start).unscheduledMinutes).toBe(40);
  });
  it('detects real requirement and deadline changes without a first-run alert', () => {
    const snapshot = fixture();
    const before = snapshotBaseline(snapshot);
    expect(detectMissionChanges({}, before)).toEqual([]);
    expect(detectMissionChanges(before, before)).toEqual([]);
    snapshot.courses[0]!.assignments[0]!.descriptionHtml += '<p>Include a diagram.</p>';
    snapshot.courses[0]!.assignments[0]!.dueAt = '2026-11-07T20:00:00Z';
    expect(detectMissionChanges(before, snapshotBaseline(snapshot)).map(change => change.id)).toEqual(['c1/a1:deadline', 'c1/a1:requirements']);
  });
  it('isolates account keys and exports only pending study blocks with escaped titles', () => {
    const snapshot = fixture();
    const start = new Date(2026, 10, 5, 9);
    const result = planMission(missionTasks(snapshot), 25, snapshot, [], start);
    result.blocks[0]!.title = 'Cell, division;\nReview';
    const calendar = missionCalendar(result.blocks, accountKey(snapshot), start);
    expect(calendar).toContain('Cell\\, division\\;\\nReview');
    expect(calendar).toContain('BEGIN:VEVENT');
    expect(missionCalendar(result.blocks.map(block => ({ ...block, completed: true })), accountKey(snapshot))).not.toContain('BEGIN:VEVENT');
    expect(accountKey(snapshot)).not.toBe(accountKey({ ...snapshot, user: { ...snapshot.user, id: 'u2' } }));
  });
});
