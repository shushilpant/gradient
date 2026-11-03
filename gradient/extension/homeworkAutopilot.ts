import type { CanvasLiveAssignment } from './liveCanvas.js';

/** Canvas assessment metadata takes precedence over the student's mode selection. */
export function homeworkAutopilotBlock(assignment: Pick<CanvasLiveAssignment, 'name' | 'htmlUrl' | 'submissionTypes' | 'descriptionHtml'> | undefined): string | null {
  if (!assignment) return 'Select a homework assignment first.';
  if (assignment.submissionTypes?.some(type => ['online_quiz', 'discussion_topic'].includes(type)) || /\/(quizzes|assessments)(\/|$)/i.test(assignment.htmlUrl)) return 'Autopilot is available for homework only. Choose study mode for this assessment.';
  if (/\b(quiz(?:zes)?|exam(?:ination)?s?|midterm|final\s+(?:test|assessment)|proctored|timed\s+(?:test|assessment)|test\s*\d*)\b/i.test(assignment.name)) return 'Autopilot is available for homework only. Choose study mode for exams and quizzes.';
  if (!assignment.descriptionHtml.replace(/<[^>]*>/g, '').trim()) return 'This homework has no readable brief yet. Refresh Canvas or open the assignment so its instructions can be loaded.';
  return null;
}
