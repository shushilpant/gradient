import type { CanvasLiveAssignment } from './liveCanvas.js';

type AssignmentAssistanceContext = Pick<CanvasLiveAssignment, 'name' | 'htmlUrl' | 'submissionTypes' | 'descriptionHtml'>;

/** Assessment restrictions apply to every assignment-specific generation mode. */
export function assessmentAssistanceBlock(assignment: AssignmentAssistanceContext | undefined): string | null {
  if (!assignment) return null; // General course concepts have no assessment context.
  let url=assignment.htmlUrl;
  try { url=decodeURIComponent(url); } catch { /* Preserve the original path for matching. */ }
  if (assignment.submissionTypes?.includes('online_quiz') || /\/(quizzes|assessments)(\/|$)/i.test(url) ||
      /\b(?:quiz(?:zes)?|exam(?:ination)?s?|midterm|test|timed|proctored|assessment)\b/i.test(assignment.name)) {
    return 'Assignment-specific generation is paused for this assessment. Autopilot is available for homework only. Choose Course concepts & syllabus for general study.';
  }
  const instructions=assignment.descriptionHtml.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ');
  if (/\b(?:timed (?:test|assessment|quiz)|proctored|exam conditions|do not use (?:any )?(?:external|outside) assistance)\b/i.test(instructions)) {
    return 'Assignment-specific generation is paused because these instructions restrict outside assistance or describe an assessment. Choose Course concepts & syllabus for general study.';
  }
  return null;
}

/** Canvas assessment metadata takes precedence over the student's mode selection. */
export function homeworkAutopilotBlock(assignment: AssignmentAssistanceContext | undefined): string | null {
  if (!assignment) return 'Select a homework assignment first.';
  const assessment=assessmentAssistanceBlock(assignment);
  if (assessment) return assessment;
  if (assignment.submissionTypes?.includes('discussion_topic')) return 'Autopilot is available for homework only. Choose study mode for this discussion.';
  if (!assignment.descriptionHtml.replace(/<[^>]*>/g,' ').trim()) return 'This homework has no readable brief yet. Refresh Canvas or open the assignment so its instructions can be loaded.';
  return null;
}
