import { finalGrade } from '../core/gradeModel.js';
import type { CourseOptimizationInput } from '../core/optimiser.js';
import {
  DEFAULT_TASK_PRIORS,
  computeEffectiveTau,
  expectedScoreFraction,
  inferTaskType,
} from '../core/optimiserPriors.js';
import type { Submission } from '../core/schema.js';
import type { CanvasLiveAssignment } from './liveCanvas.js';
import { clockTime, dueTime, isPending, relativeDue } from './plainLanguage.js';

export interface StudySplitCourse {
  code: string;
  assignments: CanvasLiveAssignment[];
  input: CourseOptimizationInput;
}

export interface StudySplitItem {
  id: string;
  courseId: string;
  assignmentId: string;
  name: string;
  code: string;
  dueAt: string | null;
  hours: number;
  reason: string;
}

const STEP_HOURS = 0.5;
const HOUR_MS = 3600000;
const MIN_GAIN_PER_HOUR = 1e-4;
const GRADE_PRECISION = 6;

interface Candidate {
  key: string;
  courseIndex: number;
  assignmentId: string;
  name: string;
  code: string;
  points: number;
  deadline: number;
  dueLabel: string;
  cap: number;
  tau: number;
  maxSteps: number;
  urgency: number;
}

function simulateScore(assignmentId: string, score: number): Submission {
  return { assignmentId, score, posted: true, excused: false, missing: false, late: false, workflowState: 'graded' };
}

/**
 * Rank half-hour blocks by estimated grade gain and deadline proximity. The
 * available hours are a ceiling, and each task gets at most one focused pass.
 */
export function allocateStudySplit(courses: StudySplitCourse[], capacityHours: number, now = new Date()): StudySplitItem[] {
  const budget = Math.floor(capacityHours / STEP_HOURS);
  const nowMs = now.getTime();
  if (!Number.isFinite(budget) || budget < 1 || !Number.isFinite(nowMs)) return [];

  const byCourse = courses.map((course, courseIndex) => {
    const candidates: Candidate[] = [];
    const groups = new Map(course.input.groups.map(group => [group.id, group]));
    const known = new Set(course.input.assignments.map(assignment => assignment.id));
    for (const assignment of course.assignments) {
      const group = groups.get(assignment.groupId);
      if (!group || !known.has(assignment.id) || assignment.lockedForUser || assignment.omitFromFinalGrade
        || assignment.pointsPossible <= 0 || !isPending(assignment)) continue;
      const deadline = dueTime(assignment);
      const hoursUntilDue = (deadline - nowMs) / HOUR_MS;
      if (hoursUntilDue < STEP_HOURS) continue;
      const taskType = inferTaskType(assignment.name, assignment.submissionTypes, group.name);
      const prior = DEFAULT_TASK_PRIORS[taskType] ?? DEFAULT_TASK_PRIORS.default!;
      const logged = course.input.loggedHours?.[assignment.id] ?? 0;
      const tau = computeEffectiveTau(prior.tau, logged, prior.alphaLogged, 1);
      const dated = Number.isFinite(deadline);
      const due = relativeDue(assignment, now);
      candidates.push({
        key: `${course.input.course.id}:${assignment.id}`,
        courseIndex,
        assignmentId: assignment.id,
        name: assignment.name,
        code: course.code,
        points: assignment.pointsPossible,
        deadline,
        dueLabel: dated ? `${due} at ${clockTime(deadline)}` : due,
        cap: prior.cap,
        tau,
        // At tau * ln(2), the curve's marginal return has halved. With no
        // deadline to plan against, suggest only a half-hour starter block.
        maxSteps: dated ? Math.max(1, Math.floor(tau * Math.LN2 / STEP_HOURS)) : 1,
        // Dated work decays over six days. Undated work is considered last.
        urgency: 0.25 + 0.75 * Math.exp(-hoursUntilDue / (6 * 24)),
      });
    }
    return candidates;
  });

  const candidates = byCourse.flat().sort((a, b) => a.deadline - b.deadline);
  const steps = new Map(candidates.map(item => [item, 0]));
  const credits = courses.map(({ input }) => input.course.creditHours * (input.priorityWeight ?? 1));
  const creditTotal = credits.reduce((total, weight) => total + weight, 0) || 1;
  const baseline = courses.map(({ input }) => finalGrade(input, { roundingDecimals: GRADE_PRECISION }));
  const projected = [...baseline];

  const gradeWithPlan = (courseIndex: number) => {
    const { input } = courses[courseIndex]!;
    const submissions = new Map(input.submissions.map(submission => [submission.assignmentId, submission]));
    for (const item of byCourse[courseIndex]!) {
      const hours = steps.get(item)! * STEP_HOURS;
      if (hours <= 0) continue;
      const score = expectedScoreFraction(hours, item.cap, item.tau) * item.points;
      submissions.set(item.assignmentId, simulateScore(item.assignmentId, score));
    }
    return finalGrade({ ...input, submissions: [...submissions.values()] }, { roundingDecimals: GRADE_PRECISION });
  };

  let remaining = budget;
  while (remaining > 0) {
    // Additional work must fit by its own deadline and leave room for already
    // planned work at each later deadline. Work can be done in deadline order.
    let scheduled = budget - remaining;
    let roomBeforeDeadline = remaining;
    const roomByItem = new Map<Candidate, number>();
    for (const item of [...candidates].reverse()) {
      const deadlineSteps = Math.floor((item.deadline - nowMs) / (HOUR_MS * STEP_HOURS));
      roomBeforeDeadline = Math.min(roomBeforeDeadline, deadlineSteps - scheduled);
      roomByItem.set(item, roomBeforeDeadline);
      scheduled -= steps.get(item)!;
    }

    let best: { item: Candidate; value: number; commit: number } | null = null;
    for (const item of candidates) {
      if (best && Number.isFinite(best.item.deadline) && !Number.isFinite(item.deadline)) break;
      const current = steps.get(item)!;
      const room = Math.min(item.maxSteps - current, roomByItem.get(item)!);
      if (room <= 0) continue;
      const base = projected[item.courseIndex]!;
      const rateAt = (horizon: number) => {
        steps.set(item, current + horizon);
        const next = gradeWithPlan(item.courseIndex);
        steps.set(item, current);
        const gradeGain = (next.percentage ?? 0) - (base.percentage ?? 0);
        const creditShare = credits[item.courseIndex]! / creditTotal;
        return creditShare * gradeGain / (horizon * STEP_HOURS);
      };
      let commit = 1;
      let rate = rateAt(1);
      if (rate <= MIN_GAIN_PER_HOUR) {
        // A dropped score may take more than one block to count. Keep any
        // lookahead within the same deadline and focused-pass limits.
        for (let horizon = 2; horizon <= room; horizon++) {
          const looked = rateAt(horizon);
          if (looked > rate) {
            commit = horizon;
            rate = looked;
          }
        }
      }
      const value = item.urgency * rate;
      if (value > (best?.value ?? MIN_GAIN_PER_HOUR)) best = { item, value, commit };
    }
    if (!best) break;
    steps.set(best.item, steps.get(best.item)! + best.commit);
    projected[best.item.courseIndex] = gradeWithPlan(best.item.courseIndex);
    remaining -= best.commit;
  }

  return candidates
    .filter(item => steps.get(item)! > 0)
    .sort((a, b) => a.deadline - b.deadline || steps.get(b)! - steps.get(a)! || a.name.localeCompare(b.name))
    .map(item => {
      const { input } = courses[item.courseIndex]!;
      const submissions = input.submissions.filter(submission => submission.assignmentId !== item.assignmentId);
      submissions.push(simulateScore(item.assignmentId, item.points));
      const fullCredit = finalGrade({ ...input, submissions }, { roundingDecimals: GRADE_PRECISION }).percentage;
      const base = baseline[item.courseIndex]!.percentage;
      const gain = fullCredit == null || base == null ? null : fullCredit - base;
      let impact = 'Full-credit impact unavailable';
      if (gain != null) {
        const amount = Math.abs(gain);
        const points = amount > 0 && amount < 0.1 ? 'less than 0.1' : Number(amount.toFixed(1));
        const unit = points === 1 ? 'percentage point' : 'percentage points';
        impact = gain < 0
          ? `Full credit reduces the final grade by ${points} ${unit}`
          : `Full credit adds ${points} ${unit} to the final grade`;
      }
      return {
        id: item.key,
        courseId: input.course.id,
        assignmentId: item.assignmentId,
        name: item.name,
        code: item.code,
        dueAt: Number.isFinite(item.deadline) ? new Date(item.deadline).toISOString() : null,
        hours: steps.get(item)! * STEP_HOURS,
        reason: `${item.dueLabel} · ${impact}`,
      };
    });
}
