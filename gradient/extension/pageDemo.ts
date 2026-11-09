import savedDemo from '../backend/demo_automation.json';
import { packetSchema } from './assistantClient.js';
import type { ComputerStep } from './computerTypes.js';
import { homeworkAutopilotBlock } from './homeworkAutopilot.js';
import type { CanvasSnapshot } from './liveCanvas.js';
import {
  beginPageAutomation,
  finishPageAutomation,
  navigatePageAutomation,
  resumePageAutomation,
  updatePageAutomation,
  waitPageAutomation,
} from './pageAutomation.js';

const LOCAL_CANVAS_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):8080$/;
const STEP_DELAY = 1500;
const RESULT_DELAY = 10_000;

interface DemoTarget {
  courseId: string;
  assignmentId: string;
}

interface DemoRunData extends DemoTarget {
  nextStep: number;
}

function validTarget(target: DemoTarget): boolean {
  return /^\d+$/.test(target.courseId) && /^\d+$/.test(target.assignmentId);
}

export function getPageDemoTarget(snapshot?: CanvasSnapshot): DemoTarget | undefined {
  if (!snapshot || !LOCAL_CANVAS_ORIGIN.test(snapshot.origin)) return;
  const course = snapshot.courses.find(item => item.code === savedDemo.courseCode);
  const assignment = course?.assignments.find(item => item.name === savedDemo.assignmentName);
  if (!course || !assignment || homeworkAutopilotBlock(assignment)) return;
  const target = { courseId: course.id, assignmentId: assignment.id };
  return validTarget(target) ? target : undefined;
}

export function startPageDemo(snapshot: CanvasSnapshot): void {
  if (snapshot.origin !== location.origin || !LOCAL_CANVAS_ORIGIN.test(location.origin)) {
    throw new Error('Open the signed-in local Canvas tab on port 8080 to run the demo.');
  }
  const target = getPageDemoTarget(snapshot);
  if (!target) throw new Error('The seeded GRADIENT-SIGNALS course and time-shift homework must be available in this Canvas account.');
  beginPageAutomation<DemoRunData>('demo', { ...target, nextStep: 0 }, 'Starting the saved GRADIENT-SIGNALS demo', snapshot.user.id);
  void resumePageDemo();
}

export function resumePageDemo(): Promise<void> {
  return resumePageAutomation<DemoRunData>('demo', async (run, signal) => {
    const { data, origin } = run;
    if (!validTarget(data) || !Number.isInteger(data.nextStep) || data.nextStep < 0 || data.nextStep > 3) {
      throw new Error('The saved demo state is invalid. Start the demo again from Gradient.');
    }
    const coursePath = `/courses/${data.courseId}`;
    const assignmentPath = `${coursePath}/assignments/${data.assignmentId}`;
    const steps: (Omit<ComputerStep, 'number'> & { label: string })[] = [
      { action: 'open', url: origin + coursePath, label: 'Opening GRADIENT-SIGNALS', reason: 'Opened the seeded Signals and Systems course.' },
      { action: 'open', url: `${origin}${coursePath}/assignments`, label: 'Opening Assignments', reason: 'Opened the course assignment list.' },
      { action: 'read', url: origin + assignmentPath, label: 'Opening Homework: Time-shift response', reason: 'Opened the time-shift homework instructions.' },
    ];

    for (const step of steps.slice(data.nextStep)) {
      const { label, ...activity } = step;
      updatePageAutomation(run, 'replaying', label);
      await waitPageAutomation(STEP_DELAY, signal);
      data.nextStep += 1;
      updatePageAutomation(run, 'replaying', label, activity);
      if (location.pathname.replace(/\/+$/, '') !== new URL(step.url).pathname) {
        await navigatePageAutomation(run, step.url, signal);
        return;
      }
    }

    if (location.pathname.replace(/\/+$/, '') !== assignmentPath) {
      throw new Error('Canvas did not reach the seeded time-shift assignment. Start the demo again.');
    }
    updatePageAutomation(run, 'replaying', 'Preparing the saved demo assignment…');
    await waitPageAutomation(RESULT_DELAY, signal);
    const packet = packetSchema.parse(savedDemo.packet);
    packet.sources = packet.sources.map(source => {
      const path = /^\/courses\/\d+\/assignments\/\d+$/.test(source.url)
        ? assignmentPath
        : source.url.replace(/^\/courses\/\d+\//, `${coursePath}/`);
      return { ...source, url: new URL(path, origin).href };
    });
    finishPageAutomation(run, packet, 'Saved GRADIENT-SIGNALS demo complete');
  });
}
