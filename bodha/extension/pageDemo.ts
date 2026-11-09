import savedDemo from '../backend/demo_automation.json';
import { packetSchema } from './assistantClient.js';
import { homeworkAutopilotBlock } from './homeworkAutopilot.js';
import type { CanvasSnapshot } from './liveCanvas.js';
import {
  beginPageAutomation,
  finishPageAutomation,
  navigatePageAutomation,
  readPageAutomation,
  resumePageAutomation,
  updatePageAutomation,
  waitPageAutomation,
} from './pageAutomation.js';

const LOCAL_CANVAS_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):8080$/;
const DEMO_ACTION_PAUSE_MS = 2500;
const DEMO_RESULT_PAUSE_MS = 10_000;
const COURSE_CODES = [savedDemo.courseCode, ...savedDemo.courseCodeAliases];
const SAVED_PACKET = packetSchema.parse(savedDemo.packet);
export const PAGE_DEMO_SEED_MESSAGE = `Seed ${savedDemo.courseCode} in the local Canvas replica, then refresh Canvas to run the demo.`;

interface DemoTarget {
  courseId: string;
  assignmentId: string;
  courseName: string;
  assignmentName: string;
}

interface DemoRunData extends DemoTarget {
  nextStep: number;
  pauseBeforeResult?: boolean;
}

function validTarget(target: DemoTarget): boolean {
  return /^\d+$/.test(target.courseId) && /^\d+$/.test(target.assignmentId) &&
    COURSE_CODES.includes(target.courseName) && target.assignmentName === savedDemo.assignmentName;
}

export function getPageDemoTarget(snapshot?: CanvasSnapshot): DemoTarget | undefined {
  if (!snapshot || !LOCAL_CANVAS_ORIGIN.test(snapshot.origin)) return;
  for (const code of COURSE_CODES) {
    for (const course of snapshot.courses) {
      if (course.code !== code || !/^\d+$/.test(course.id)) continue;
      const assignment = course.assignments.find(item =>
        item.name === savedDemo.assignmentName && /^\d+$/.test(item.id) && !homeworkAutopilotBlock(item));
      if (assignment) return { courseId: course.id, assignmentId: assignment.id, courseName: code, assignmentName: assignment.name };
    }
  }
  return undefined;
}

export function startPageDemo(snapshot: CanvasSnapshot, { pauseBeforeResult = false } = {}): void {
  if (snapshot.origin !== location.origin || !LOCAL_CANVAS_ORIGIN.test(location.origin)) {
    throw new Error('Open the signed-in local Canvas tab on port 8080 to run the demo.');
  }
  const target = getPageDemoTarget(snapshot);
  if (!target) throw new Error(PAGE_DEMO_SEED_MESSAGE);
  beginPageAutomation<DemoRunData>('demo', { ...target, nextStep: 0, pauseBeforeResult }, `Starting the Canvas demo · ${target.courseName}`, snapshot.user.id);
  void resumePageDemo();
}

export function resumePageDemo(): Promise<void> {
  return resumePageAutomation<DemoRunData>('demo', async (run, signal) => {
    const { data, origin } = run;
    if (!data || !validTarget(data) || !Number.isInteger(data.nextStep) ||
        data.nextStep < 0 || data.nextStep > savedDemo.navigation.length) {
      throw new Error('The saved demo state is invalid. Start the demo again from OffCanvas.');
    }
    const coursePath = `/courses/${data.courseId}`;
    const assignmentPath = `${coursePath}/assignments/${data.assignmentId}`;
    const actionPause = data.pauseBeforeResult ? DEMO_ACTION_PAUSE_MS : undefined;
    for (const step of savedDemo.navigation.slice(data.nextStep)) {
      const path = coursePath + step.path.replace('{assignmentId}', data.assignmentId);
      const url = origin + path;
      const label = step.label.replace('{courseCode}', data.courseName).replace('{assignmentName}', data.assignmentName);
      data.nextStep += 1;
      updatePageAutomation(run, 'replaying', label, { action: 'open', url, reason: step.reason });
      if (location.pathname.replace(/\/+$/, '') !== path) {
        await navigatePageAutomation(run, url, signal, actionPause);
        return;
      }
    }

    if (location.pathname.replace(/\/+$/, '') !== assignmentPath) {
      throw new Error('Canvas did not reach the homework assignment. Start the demo again.');
    }
    updatePageAutomation(run, 'replaying', 'Reading the homework instructions in Canvas…');
    await readPageAutomation(run, signal, actionPause);
    updatePageAutomation(run, 'replaying', 'Read the homework instructions.', {
      action: 'read', url: origin + assignmentPath, reason: 'Read and scrolled the homework instructions in Canvas.',
    });
    if (data.pauseBeforeResult) {
      updatePageAutomation(run, 'replaying', 'Preparing the reference assignment…');
      await waitPageAutomation(DEMO_RESULT_PAUSE_MS, signal);
    }
    const sources = SAVED_PACKET.sources.map(source => {
      const path = /^\/courses\/\d+\/assignments\/\d+$/.test(source.url)
        ? assignmentPath
        : source.url.replace(/^\/courses\/\d+\//, `${coursePath}/`);
      return { ...source, url: new URL(path, origin).href };
    });
    finishPageAutomation(run, { ...SAVED_PACKET, sources }, 'Canvas demo complete');
  });
}
