import { useMemo, useState } from 'preact/hooks';
import { rankDeadlinePriorities, type PrioritizedAssignment } from '../assignmentPriorities.js';
import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { clockTime, daysUntil, LOCALE, relativeDue } from '../plainLanguage.js';
import { allocateStudySplit, type StudySplitCourse } from '../studySplit.js';
import { courseColour, gradeImpactLabel, TaskRow, type Task } from './Dashboard.js';
import { Icon } from './Icons.js';
import { PanicAutomationDemo } from './PanicAutomationDemo.js';

const VISIBLE_PRIORITIES = 4;
const QUICK_BUDGETS = [{ hours: 0.5, label: '30 min' }, { hours: 1, label: '1 hr' }, { hours: 2, label: '2 hrs' }];

function assignmentTitle(task: Task): string {
  return task.assignment.name.replace(/^(?:homework|lab planning):\s*/i, '') || task.assignment.name;
}

function PriorityBriefing({ tasks, now, hasOverdue = false, onOpen }: {
  tasks: PrioritizedAssignment[];
  now: number;
  hasOverdue?: boolean;
  onOpen?: () => void;
}) {
  const date = new Date(now);
  const [first, next, later] = tasks;
  const firstDue = first && relativeDue(first.assignment, date).replace(/^Due/, 'due');
  const impact = onOpen && first?.gradeImpact != null && first.gradeImpact > 0;
  const laterDue = later && next && daysUntil(later.deadline, date) > daysUntil(next.deadline, date)
    ? ` is ${relativeDue(later.assignment, date).replace(/^Due/, 'due')}` : ' follows';
  return <header class="g-greeting">
    <p class="g-eyebrow">{date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 class="g-title g-priority-headline">{first
      ? <>{onOpen ? <button class="g-priority-name" onClick={onOpen}>{assignmentTitle(first)}</button> : assignmentTitle(first)} is {firstDue}{impact && ` and has the biggest grade impact in ${first.course.code}`}.</>
      : hasOverdue ? 'Check your past-due assignments.' : 'No upcoming deadlines.'}</h1>
    {next && <p class="g-lede">{assignmentTitle(next)} is next.{later && ` ${assignmentTitle(later)}${laterDue}.`}</p>}
  </header>;
}

function timeLeft(deadline: number, now: number): string {
  const minutes = Math.floor((deadline - now) / 60_000);
  if (minutes < 1) return '<1m left';
  const hours = Math.floor(minutes / 60);
  return `${hours ? `${hours}h ` : ''}${minutes % 60}m left`;
}

export function AssignmentPriorities({ snapshot, upcoming, hasOverdue, studyCourses, now, panic, onPanicToggle, onOpen, onPrepare, onAutomate, onDemoReplay }: {
  snapshot: CanvasSnapshot;
  upcoming: PrioritizedAssignment[];
  hasOverdue: boolean;
  studyCourses: StudySplitCourse[];
  now: number;
  panic: boolean;
  onPanicToggle: () => void;
  onOpen: (task: Task) => void;
  onPrepare: (task: Task) => void;
  onAutomate?: (task: Task) => void;
  onDemoReplay: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const quickStudy = useMemo(() => {
    if (!panic || budget == null) return null;
    const [block] = allocateStudySplit(studyCourses, budget, new Date(now));
    if (!block) return null;
    const course = snapshot.courses.find(item => item.id === block.courseId);
    const assignment = course?.assignments.find(item => item.id === block.assignmentId);
    return course && assignment ? { task: { course, assignment }, block } : null;
  }, [panic, budget, snapshot, studyCourses, now]);

  const top = upcoming[0];
  const ranked = panic ? rankDeadlinePriorities(upcoming, now) : upcoming.slice(1);
  const firstDeadline = panic ? ranked[0] : undefined;
  const automationBlock = firstDeadline && homeworkAutopilotBlock(firstDeadline.assignment);
  const visible = expanded ? ranked : ranked.slice(0, VISIBLE_PRIORITIES);
  const quickImpact = quickStudy && upcoming.find(task => task.assignment === quickStudy.task.assignment)?.gradeImpact;
  return <div class="g-priority-stack">
    {!panic && top ? <section class="g-next" style={{ '--course': courseColour(snapshot, top.course.id) }} aria-label="Top grade priority">
      <PriorityBriefing tasks={upcoming} now={now} onOpen={() => onOpen(top)}/>
      <p class="g-small g-priority-meta">{top.course.code} · Due at {clockTime(top.deadline)} · {gradeImpactLabel(top.gradeImpact)}</p>
      <div class="g-priority-actions">
        <a class="g-primary" href={top.assignment.htmlUrl}>Open in Canvas <Icon name="external" size={14}/></a>
        {!homeworkAutopilotBlock(top.assignment) && <button class="g-link-btn" onClick={() => onPrepare(top)}><Icon name="spark" size={14}/>Prepare with AI</button>}
      </div>
    </section> : <PriorityBriefing tasks={quickStudy ? ranked.slice(0, 1) : ranked} now={now} hasOverdue={hasOverdue}/>}
    <section class="g-card g-priority-list" aria-label="Assignment priorities">
      <div class="g-section-head">
        <h2 class="g-h-sans">Assignment priorities</h2>
        <button id="offcanvas-panic-toggle" class="g-secondary g-panic-toggle" aria-expanded={panic} aria-controls="offcanvas-priority-content" onClick={() => { setExpanded(false); setBudget(null); onPanicToggle(); }}>
          <Icon name="clock" size={14}/>{panic ? 'Exit panic mode' : 'Panic button'}
        </button>
      </div>
      <div id="offcanvas-priority-content" role={panic ? 'region' : undefined} aria-label={panic ? 'Deadline priorities' : undefined}>
        {panic && <div class="g-quick-study">
          <div class="g-chips" role="group" aria-label="Time available now">
            <span class="g-small">I have</span>
            {QUICK_BUDGETS.map(({ hours, label }) => <button key={hours} class={`g-chip${budget === hours ? ' active' : ''}`} aria-pressed={budget === hours} onClick={() => setBudget(budget === hours ? null : hours)}>{label}</button>)}
          </div>
          <div aria-live="polite">
            {quickStudy ? <div class="g-quick-result">
              <p class="g-small">Start with <strong>{quickStudy.block.hours * 60} min</strong> on <strong>{assignmentTitle(quickStudy.task)}</strong>.</p>
              <p class="g-small">{relativeDue(quickStudy.task.assignment, new Date(now))}{quickImpact != null && ` · ${gradeImpactLabel(quickImpact)}`}</p>
              <button class="g-link-btn" onClick={() => onOpen(quickStudy.task)}>Open assignment <Icon name="arrow" size={14}/></button>
            </div> : budget != null && <p class="g-small g-quick-result">No study block suggested for this time.</p>}
          </div>
        </div>}
        {firstDeadline && !quickStudy && <div class="g-panic-actions">
          <a class="g-link-btn" href={firstDeadline.assignment.htmlUrl} aria-label={`Start ${firstDeadline.assignment.name} in Canvas`}>
            Start in Canvas <Icon name="external" size={13}/>
          </a>
          {onAutomate && !automationBlock && <button class="g-secondary" onClick={() => onAutomate(firstDeadline)}>
            <Icon name="bolt" size={14}/>Automate assignment
          </button>}
        </div>}
        {onAutomate && automationBlock && !quickStudy && <p class="g-small">Computer use is available for homework with readable instructions.</p>}
        {visible.length > 0 ? <ol class="g-priority-items" role="list" start={panic ? 1 : 2}>{visible.map((task, index) =>
          <li key={`${task.course.id}:${task.assignment.id}`} class="g-priority-item">
            <span class="g-priority-number" aria-hidden="true">{index + (panic ? 1 : 2)}</span>
            <TaskRow task={task} snapshot={snapshot} onSelect={() => onOpen(task)} gradeImpact={task.gradeImpact}
              dueLabel={panic ? timeLeft(task.deadline, now) : undefined}/>
          </li>)}</ol> : <p class="g-small">{top ? 'This is your only upcoming assignment you can start.' : 'No upcoming assignments you can start.'}</p>}
        {ranked.length > VISIBLE_PRIORITIES && <button class="g-link-btn g-priority-start" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer assignments' : `Show all ${upcoming.length} priorities`} <Icon name="chevron" size={14}/>
        </button>}
        {panic && hasOverdue && <p class="g-small g-priority-note">Check Coursework for past-due work.</p>}
        {panic && <PanicAutomationDemo compact onReplay={onDemoReplay}/>}
      </div>
      {!!upcoming.length && <p class="g-small g-priority-note">Grade impact estimates how many percentage points full credit adds to the final course grade, with other ungraded work scored zero.</p>}
    </section>
  </div>;
}
