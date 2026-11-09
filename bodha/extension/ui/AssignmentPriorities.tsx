import { useEffect, useState } from 'preact/hooks';
import { rankDeadlinePriorities, type PrioritizedAssignment } from '../assignmentPriorities.js';
import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { daysUntil, LOCALE, relativeDue } from '../plainLanguage.js';
import { courseColour, gradeImpactLabel, TaskRow, type Task } from './Dashboard.js';
import { Icon } from './Icons.js';
import { PanicAutomationDemo } from './PanicAutomationDemo.js';

const VISIBLE_PRIORITIES = 4;

function timeLeft(deadline: number, now: number): string {
  const minutes = Math.floor((deadline - now) / 60_000);
  if (minutes < 1) return '<1m left';
  const hours = Math.floor(minutes / 60);
  return `${hours ? `${hours}h ` : ''}${minutes % 60}m left`;
}

function TopPriority({ task, snapshot, onPrepare, onOpen }: {
  task: PrioritizedAssignment;
  snapshot: CanvasSnapshot;
  onPrepare: () => void;
  onOpen: () => void;
}) {
  const { course, assignment, deadline, gradeImpact } = task;
  const days = daysUntil(deadline);
  const date = new Date(deadline);
  return <section class={`g-next${days <= 1 ? ' soon' : ''}`} style={{ '--course': courseColour(snapshot, course.id) }} aria-label="Top grade priority">
    <div class="g-next-when">
      <strong>{days <= 0 ? 'Today' : days === 1 ? 'Tmrw' : date.toLocaleDateString(LOCALE, { weekday: 'short' })}</strong>
      <span>{date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
    </div>
    <div class="g-next-main">
      <span class="g-eyebrow">Top grade priority · {course.code}</span>
      <button class="g-next-title" onClick={onOpen}>{assignment.name}</button>
      <p>{relativeDue(assignment)} at {date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} · {gradeImpactLabel(gradeImpact)}</p>
      <div class="g-priority-actions">
        <a class="g-primary" href={assignment.htmlUrl}>Open in Canvas <Icon name="external" size={14}/></a>
        {!homeworkAutopilotBlock(assignment) && <button class="g-link-btn" onClick={onPrepare}><Icon name="spark" size={14}/>Prepare with AI</button>}
      </div>
    </div>
  </section>;
}

export function AssignmentPriorities({ snapshot, priorities, panic, onPanicToggle, onOpen, onPrepare, onAutomate, onDemoReplay }: {
  snapshot: CanvasSnapshot;
  priorities: PrioritizedAssignment[];
  panic: boolean;
  onPanicToggle: () => void;
  onOpen: (task: Task) => void;
  onPrepare: (task: Task) => void;
  onAutomate?: (task: Task) => void;
  onDemoReplay: () => boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [panic]);

  const upcoming = priorities.filter(task => task.deadline > now);
  const top = upcoming[0];
  const ranked = panic ? rankDeadlinePriorities(upcoming, now) : upcoming.slice(1);
  const firstDeadline = panic ? ranked[0] : undefined;
  const automationBlock = firstDeadline && homeworkAutopilotBlock(firstDeadline.assignment);
  const visible = expanded ? ranked : ranked.slice(0, VISIBLE_PRIORITIES);
  return <div class="g-priority-stack">
    {!panic && top && <TopPriority task={top} snapshot={snapshot} onPrepare={() => onPrepare(top)} onOpen={() => onOpen(top)}/>}
    <section class="g-card g-priority-list" aria-label="Assignment priorities">
      <div class="g-section-head">
        <h2 class="g-h-sans">Assignment priorities</h2>
        <button id="offcanvas-panic-toggle" class="g-secondary g-panic-toggle" aria-expanded={panic} aria-controls="offcanvas-priority-content" onClick={() => { setExpanded(false); onPanicToggle(); }}>
          <Icon name="clock" size={14}/>{panic ? 'Exit panic mode' : 'Panic button'}
        </button>
      </div>
      <div id="offcanvas-priority-content" role={panic ? 'region' : undefined} aria-label={panic ? 'Deadline priorities' : undefined}>
        {panic && <p class="g-small">Work due within 2 hours comes first, then within 24 hours, then later. Each group starts with the biggest grade impact.</p>}
        {firstDeadline && <div class="g-panic-actions">
          <a class="g-link-btn" href={firstDeadline.assignment.htmlUrl} aria-label={`Start ${firstDeadline.assignment.name} in Canvas`}>
            Start in Canvas <Icon name="external" size={13}/>
          </a>
          {onAutomate && !automationBlock && <button class="g-secondary" onClick={() => onAutomate(firstDeadline)}>
            <Icon name="bolt" size={14}/>Automate assignment
          </button>}
        </div>}
        {onAutomate && automationBlock && <p class="g-small">Computer use is available for homework with readable instructions.</p>}
        {visible.length > 0 ? <ol class="g-priority-items" role="list" start={panic ? 1 : 2}>{visible.map((task, index) =>
          <li key={`${task.course.id}:${task.assignment.id}`} class="g-priority-item">
            <span class="g-priority-number" aria-hidden="true">{index + (panic ? 1 : 2)}</span>
            <TaskRow task={task} snapshot={snapshot} onSelect={() => onOpen(task)} gradeImpact={task.gradeImpact}
              dueLabel={panic ? timeLeft(task.deadline, now) : undefined}/>
          </li>)}</ol> : <p class="g-small">{top ? 'This is your only upcoming assignment you can start.' : 'No upcoming assignments you can start.'}</p>}
        {ranked.length > VISIBLE_PRIORITIES && <button class="g-link-btn g-priority-start" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer assignments' : `Show all ${upcoming.length} priorities`} <Icon name="chevron" size={14}/>
        </button>}
        {panic && priorities.length > upcoming.length && <p class="g-small g-priority-note">Check Coursework for past-due work.</p>}
        {panic && <PanicAutomationDemo compact onReplay={onDemoReplay}/>}
      </div>
      {!!upcoming.length && <p class="g-small g-priority-note">Grade impact estimates how many percentage points full credit adds to the final course grade, with other ungraded work scored zero.</p>}
    </section>
  </div>;
}
