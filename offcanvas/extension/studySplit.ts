import { getGradePoints, getLetterGrade } from '../core/grade.js';
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

export interface StudySplitCourse {
  code: string;
  assignments: CanvasLiveAssignment[];
  input: CourseOptimizationInput;
}

export interface StudySplitItem {
  id: string;
  name: string;
  code: string;
  hours: number;
  reason: string;
}

const STEP_HOURS = 0.5;
const MAX_HOURS = 8;
/** A letter-grade step is worth this many semester-percentage points when bids are compared. */
const LETTER_WEIGHT = 8;

interface Candidate {
  key: string;
  courseIndex: number;
  assignmentId: string;
  name: string;
  code: string;
  points: number;
  dueAt: string | null;
  cap: number;
  tau: number;
  urgency: number;
  reason: string;
}

function openForStudy(assignment: CanvasLiveAssignment): boolean {
  const submission = assignment.submission;
  const state = submission?.workflowState;
  return !assignment.lockedForUser && !assignment.omitFromFinalGrade && assignment.pointsPossible > 0
    && !submission?.excused && submission?.score == null
    && state !== 'submitted' && state !== 'pending_review' && state !== 'graded';
}

function dayStamp(value: Date): number {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Sooner deadlines outrank undated work. Past-due work is not eligible. */
function urgencyOf(dueAt: string | null, now: Date): number {
  if (!dueAt) return 0.35;
  const days = (dayStamp(new Date(dueAt)) - dayStamp(now)) / 86400000;
  if (days < 0) return 0;
  return 0.25 + 0.75 * Math.exp(-days / 6);
}

function dueLabel(dueAt: string | null, now: Date): string {
  if (!dueAt) return 'No due date';
  const days = Math.round((dayStamp(new Date(dueAt)) - dayStamp(now)) / 86400000);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function pointsLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Splits a fixed study budget across outstanding work.
 * Each half hour goes to the assignment whose next block most improves the
 * credit-weighted grade, discounted by how soon it is due. Drop rules, group
 * weights, points, and the learning curve are applied through the grade model.
 */
export function allocateStudySplit(courses: StudySplitCourse[], capacityHours: number, now = new Date()): StudySplitItem[] {
  const budget = Math.max(0, Math.round(capacityHours / STEP_HOURS));
  const maxSteps = Math.round(MAX_HOURS / STEP_HOURS);
  const nowMs = now.getTime();
  const candidates: Candidate[] = [];

  courses.forEach((course, courseIndex) => {
    const groups = new Map(course.input.groups.map(group => [group.id, group]));
    const known = new Set(course.input.assignments.map(assignment => assignment.id));
    const coursePoints = course.input.assignments
      .filter(assignment => !assignment.omitFromFinalGrade && groups.has(assignment.groupId))
      .reduce((sum, assignment) => sum + assignment.pointsPossible, 0);
    for (const assignment of course.assignments) {
      if (!openForStudy(assignment) || !known.has(assignment.id) || !groups.has(assignment.groupId)) continue;
      const dueAt = assignment.dueAt ?? null;
      if (dueAt && new Date(dueAt).getTime() <= nowMs) continue;
      const group = groups.get(assignment.groupId)!;
      const taskType = inferTaskType(assignment.name, assignment.submissionTypes, group.name);
      const prior = DEFAULT_TASK_PRIORS[taskType] ?? DEFAULT_TASK_PRIORS.default!;
      const logged = course.input.loggedHours?.[assignment.id] ?? 0;
      const weighted = course.input.course.applyGroupWeights && group.weight > 0;
      const stake = weighted
        ? `${group.name} is ${pointsLabel(group.weight)}% of the grade`
        : `${pointsLabel(assignment.pointsPossible)} of ${pointsLabel(coursePoints)} course points`;
      candidates.push({
        key: `${course.input.course.id}:${assignment.id}`,
        courseIndex,
        assignmentId: assignment.id,
        name: assignment.name,
        code: course.code,
        points: assignment.pointsPossible,
        dueAt,
        cap: prior.cap,
        tau: computeEffectiveTau(prior.tau, logged, prior.alphaLogged, 1),
        urgency: urgencyOf(dueAt, now),
        reason: `${dueLabel(dueAt, now)} · ${stake}`,
      });
    }
  });

  const steps = new Map(candidates.map(item => [item.key, 0]));
  const creditTotal = courses.reduce((sum, course) => sum + course.input.course.creditHours * (course.input.priorityWeight ?? 1), 0) || 1;

  const semester = () => {
    let gpa = 0;
    let pct = 0;
    courses.forEach((course, courseIndex) => {
      const submissions: Submission[] = course.input.submissions.map(submission => ({ ...submission }));
      const byId = new Map(submissions.map(submission => [submission.assignmentId, submission]));
      for (const item of candidates) {
        if (item.courseIndex !== courseIndex) continue;
        const spent = (steps.get(item.key) ?? 0) * STEP_HOURS;
        if (spent <= 0) continue;
        const next: Submission = {
          assignmentId: item.assignmentId,
          score: expectedScoreFraction(spent, item.cap, item.tau) * item.points,
          posted: true,
          excused: false,
          missing: false,
          late: false,
          workflowState: 'graded',
        };
        const existing = byId.get(item.assignmentId);
        if (existing) Object.assign(existing, next);
        else submissions.push(next);
        byId.set(item.assignmentId, next);
      }
      const grade = finalGrade({
        course: course.input.course,
        groups: course.input.groups,
        assignments: course.input.assignments,
        submissions,
      }, { roundingDecimals: 6 });
      const percentage = grade.percentage ?? 0;
      const letter = getLetterGrade(percentage, course.input.course.gradingScheme);
      const weight = course.input.course.creditHours * (course.input.priorityWeight ?? 1) / creditTotal;
      gpa += weight * getGradePoints(letter, course.input.course.gradePointScale);
      pct += weight * percentage;
    });
    return { gpa, pct };
  };

  let remaining = budget;
  let guard = 0;
  while (remaining > 0 && guard < budget * 4) {
    guard += 1;
    const base = semester();
    let best: { item: Candidate; value: number; commit: number } | null = null;
    for (const item of candidates) {
      const current = steps.get(item.key) ?? 0;
      const room = Math.min(maxSteps - current, remaining);
      if (room <= 0) continue;
      const rateAt = (horizon: number) => {
        steps.set(item.key, current + horizon);
        const next = semester();
        steps.set(item.key, current);
        return ((next.pct - base.pct) + (next.gpa - base.gpa) * LETTER_WEIGHT) / (horizon * STEP_HOURS);
      };
      const immediate = rateAt(1);
      let commit = 1;
      let rate = immediate;
      if (!(immediate > 1e-4)) {
        commit = 0;
        rate = -Infinity;
        for (const horizon of [2, 3, 4, 5, 6, 8]) {
          if (horizon > room) break;
          const looked = rateAt(horizon);
          if (looked > 1e-4) {
            commit = horizon;
            rate = looked;
            break;
          }
        }
      }
      const value = item.urgency * rate;
      if (commit > 0 && (!best || value > best.value)) best = { item, value, commit };
    }
    if (!best || best.value <= 1e-4) break;
    steps.set(best.item.key, (steps.get(best.item.key) ?? 0) + best.commit);
    remaining -= best.commit;
  }

  return candidates
    .filter(item => (steps.get(item.key) ?? 0) > 0)
    .sort((a, b) => (steps.get(b.key)! - steps.get(a.key)!) || b.urgency - a.urgency || a.name.localeCompare(b.name))
    .map(item => ({
      id: item.key,
      name: item.name,
      code: item.code,
      hours: (steps.get(item.key) ?? 0) * STEP_HOURS,
      reason: item.reason,
    }));
}
