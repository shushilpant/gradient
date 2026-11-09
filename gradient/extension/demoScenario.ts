/** Synthetic context used only by explicit preview and presentation demo actions. */
import { CanvasAdapter } from './adapter/canvasAdapter.js';
import type { CanvasSnapshot } from './liveCanvas.js';
import { currentGrade, finalGrade } from '../core/gradeModel.js';
import rawCourses from '../sandbox/fixtures/sandbox_all_courses.json';
import materials from '../sandbox/fixtures/course_materials.json';
import announcements from '../sandbox/fixtures/announcements.json';
import scenario from '../sandbox/fixtures/hackathon_scenario.json';

export function createDemoSnapshot(origin: string, now = new Date()): CanvasSnapshot {
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Synthetic context is restricted to localhost.');
  const adapter = new CanvasAdapter();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    origin, syncedAt: now.toISOString(), user: { ...scenario.student }, issues: [],
    courses: rawCourses.map((raw, index) => {
      const id = String(raw.course.id);
      const additions = scenario.assignments.filter(item => item.courseId === id).map(item => ({
        id: item.id, course_id: id, name: item.name, assignment_group_id: item.groupId, points_possible: item.points,
        due_at: new Date(day + item.daysFromStart * 86400000 + 23 * 3600000 + 59 * 60000).toISOString(),
        description: item.description, submission_types: ['online_upload'], published: true, has_rubric: true,
        rubric: item.rubric.map(criterion => ({ ...criterion, ratings: [{ id: `${criterion.id}-full`, description: criterion.description, points: criterion.points }] })),
      }));
      const parsedAssignments = adapter.parseAssignments([...raw.assignments, ...additions]);
      const input = {
        course: adapter.parseCourse(raw.course, index === 1 ? 3 : 4),
        groups: adapter.parseAssignmentGroups(raw.assignment_groups), assignments: parsedAssignments,
        submissions: adapter.parseSubmissions(raw.submissions), priorityWeight: 1,
        loggedHours: (id === '99001' ? { '1008': 3.5 } : {}) as Record<string, number>,
      };
      const resources = [...materials.filter(item => item.courseId === id), ...scenario.materials.filter(item => item.courseId === id)];
      return {
        id, name: raw.course.name, code: raw.course.course_code, url: `${origin}/courses/${id}`,
        syllabusHtml: `${raw.course.syllabus_body}<p>${scenario.courses.find(item => item.id === id)?.topics ?? ''}</p>`, input,
        currentScore: currentGrade(input).percentage, finalScore: finalGrade(input).percentage,
        assignments: parsedAssignments.map(assignment => ({ ...assignment,
          htmlUrl: `${origin}/courses/${id}/assignments/${assignment.id}`,
          descriptionHtml: additions.find(item => item.id === assignment.id)?.description ?? assignment.rubric?.map(criterion => `<p>${criterion.description}</p>`).join('') ?? '',
          submission: input.submissions.find(submission => submission.assignmentId === assignment.id) ?? null,
        })),
        resources: resources.map(item => ({ id: item.id, type: 'page' as const, title: item.title, url: `${origin}/courses/${id}/pages/${item.id}` })),
        announcements: announcements.filter(item => item.context_code === `course_${id}`).map(item => ({ id: String(item.id), title: item.title, bodyHtml: item.message, postedAt: item.posted_at, url: `${origin}/courses/${id}` })),
        calendarEvents: [], issues: [],
      };
    }),
  };
}
