import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import savedDemo from '../../backend/demo_automation.json';
import { currentGrade } from '../../core/gradeModel.js';
import { optimizeEffort } from '../../core/optimiser.js';
import { DEFAULT_GRADE_POINT_SCALE } from '../../core/schema.js';
import { getAcademicContext } from '../academicContext.js';
import { packetSchema } from '../assistantClient.js';
import type { CanvasLiveAssignment, CanvasSnapshot } from '../liveCanvas.js';
import { AutomationPresentationDemo } from './AutomationPresentationDemo.js';
import { GroundedMarkdown } from './AssistantView.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';
import { Icon } from './Icons.js';
import { ComputedVisuals } from './WorkEvidence.js';

export interface DemoStep { title: string; detail: string; ms: number; ticks?: string[] }

const packet = packetSchema.parse(savedDemo.packet);
const PLAN_HOURS = 8;

function pending(a: CanvasLiveAssignment): boolean {
  const state = a.submission?.workflowState;
  return !a.submission?.excused && a.submission?.score == null && state !== 'submitted' && state !== 'pending_review' && state !== 'graded';
}
function due(a: CanvasLiveAssignment): number { return a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY; }
function dueText(a: CanvasLiveAssignment): string {
  if (!a.dueAt) return 'No due date';
  const days = Math.round((new Date(a.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return 'Past due';
  if (days === 0) return 'Due today';
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}
function clock(ms: number): string { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${Math.floor(ms / 100) % 10}`; }
function clamp(n: number | null | undefined): number { return Math.min(100, Math.max(0, n ?? 0)); }

/** Plays a scripted sequence of steps with varied timings, then reveals the prepared result. */
export function StagedRun({ label, steps, children, onDone }: { label: string; steps: DemoStep[]; children: ComponentChildren; onDone?: () => void }) {
  const [run, setRun] = useState(0);
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  const stepStarted = useRef(Date.now());
  const done = index >= steps.length;
  const resultRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    doneRef.current?.();
    return () => clearTimeout(timer);
  }, [done, run]);

  useEffect(() => { started.current = stepStarted.current = Date.now(); setIndex(0); setTick(0); setTimes([]); setElapsed(0); }, [run]);
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => clearInterval(timer);
  }, [done, run]);
  useEffect(() => {
    const step = steps[index];
    if (!step) return;
    stepStarted.current = Date.now();
    setTick(0);
    const duration = step.ms * (0.85 + Math.random() * 0.3);
    const ticks = step.ticks?.length ?? 0;
    const ticker = ticks > 1 ? setInterval(() => setTick(t => Math.min(ticks - 1, t + 1)), duration / ticks) : undefined;
    const finish = setTimeout(() => {
      setTimes(previous => [...previous, Date.now() - stepStarted.current]);
      setIndex(i => i + 1);
    }, duration);
    return () => { clearTimeout(finish); if (ticker) clearInterval(ticker); };
  }, [index, run]);

  const percent = Math.round(Math.min(index, steps.length) / steps.length * 100);
  return <>
    <section class={`g-card g-run${done ? ' finished' : ''}`} aria-label={`${label} demo run`} aria-busy={!done}>
      <div class="g-run-head">
        <span class="g-run-pulse" aria-hidden="true"/>
        <strong>{done ? `${label} ready` : `Running ${label.toLowerCase()}…`}</strong>
        <span class="g-run-clock">{clock(done ? times.reduce((a, b) => a + b, 0) : elapsed)}</span>
        {done && <button class="g-link-btn" onClick={() => setRun(r => r + 1)}>Run again <Icon name="refresh" size={14}/></button>}
      </div>
      <div class="g-run-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${label} progress`}><i style={{ width: `${Math.max(4, percent)}%` }}/></div>
      <ol class="g-run-steps">{steps.map((step, i) => {
        const state = i < index ? 'done' : i === index ? 'active' : 'waiting';
        return <li key={step.title} class={state}>
          <span class="g-run-dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14}/> : state === 'active' ? <Icon name="refresh" size={14} className="g-spinner"/> : i + 1}</span>
          <div><strong>{step.title}</strong><small aria-live={state === 'active' ? 'polite' : undefined}>{state === 'active' && step.ticks ? step.ticks[tick] : step.detail}</small></div>
          <span class="g-run-time">{times[i] != null ? `${(times[i]! / 1000).toFixed(1)} s` : ''}</span>
        </li>;
      })}</ol>
    </section>
    {done && <div ref={resultRef} class="g-run-result g-stack">{children}</div>}
  </>;
}

export function AcademicsDemo({ snapshot, onDone }: { snapshot: CanvasSnapshot; onDone?: () => void }) {
  const courses = snapshot.courses;
  const assignments = courses.flatMap(course => course.assignments.map(assignment => ({ course, assignment })));
  const materials = courses.reduce((n, course) => n + course.resources.length, 0);
  const result = useMemo(() => {
    const grades = courses.map(course => ({ course, rebuilt: currentGrade(course.input).percentage }));
    const priorities = assignments.filter(t => pending(t.assignment) && due(t.assignment) >= Date.now())
      .sort((a, b) => due(a.assignment) - due(b.assignment) || b.assignment.pointsPossible - a.assignment.pointsPossible).slice(0, 3);
    let plan: { name: string; code: string; hours: number }[] = [];
    try {
      const inputs = courses.map(course => ({ ...course.input, studyEligibleAssignmentIds: course.assignments.filter(pending).map(a => a.id), course: { ...course.input.course, creditHours: 3, gradePointScale: DEFAULT_GRADE_POINT_SCALE } }));
      plan = optimizeEffort(inputs, { capacityHours: PLAN_HOURS, stepSizeHours: .5, numSamples: 100, seed: 42, currentTime: new Date(), protectMastery: true, masteryFloorHours: .5, isRobustnessRun: true })
        .recommendations.map(rec => ({ name: rec.assignmentName, code: courses.find(c => c.id === rec.courseId)?.code ?? '', hours: rec.allocatedHours }));
    } catch { plan = []; }
    return { grades, priorities, plan };
  }, [snapshot]);
  const steps: DemoStep[] = [
    { title: 'Connecting to Canvas', detail: `Signed in as ${snapshot.user.shortName || snapshot.user.name} · read-only`, ms: 1100, ticks: ['Checking your session…', 'Session verified · read-only access'] },
    { title: 'Syncing your courses', detail: `${courses.length} courses · ${assignments.length} assignments · ${materials} materials`, ms: 2100, ticks: courses.map((c, i) => `Reading ${c.code} (${i + 1} of ${courses.length})…`) },
    { title: 'Rebuilding every grade', detail: 'Weights, drop rules and missing work applied', ms: 1500, ticks: ['Applying assignment-group weights…', 'Checking drop rules…', 'Comparing with Canvas totals…'] },
    { title: 'Ranking what to do next', detail: 'Deadlines weighed against points and grade impact', ms: 1300, ticks: ['Sorting by deadline…', 'Weighing grade impact…'] },
    { title: 'Planning your study time', detail: `100 grade scenarios for ${PLAN_HOURS} hours`, ms: 1800, ticks: ['Running scenarios 1–40…', 'Running scenarios 41–80…', 'Running scenarios 81–100…', 'Choosing the steadiest split…'] },
  ];
  return <StagedRun label="Academics" steps={steps} onDone={onDone}>
    <section class="g-card" aria-label="Rebuilt grades">
      <div class="g-section-head"><h2>Grades rebuilt</h2><span class="g-label-count">{result.grades.length} courses</span></div>
      {result.grades.map(({ course, rebuilt }) => {
        const matches = rebuilt != null && course.currentScore != null && Math.abs(rebuilt - course.currentScore) < 0.05;
        return <div key={course.id} class="g-demo-row">
          <div class="g-demo-row-main"><strong>{course.code}</strong><span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${clamp(rebuilt)}%` }}/></span></div>
          <span class="g-demo-score">{rebuilt == null ? '--' : `${rebuilt.toFixed(1)}%`}</span>
          {matches && <span class="g-demo-ok"><Icon name="check" size={13}/>Matches Canvas</span>}
        </div>;
      })}
    </section>
    <section class="g-card" aria-label="Priorities">
      <div class="g-section-head"><h2>Do these first</h2></div>
      {result.priorities.length ? result.priorities.map(({ course, assignment }, i) => <div key={assignment.id} class="g-task">
        <div class={`g-task-marker ${i === 0 ? 'urgent' : 'soon'}`}><span class="g-demo-rank">{i + 1}</span></div>
        <div class="g-task-main"><strong>{assignment.name}</strong><div class="g-task-meta"><span>{course.code}</span><span>{assignment.pointsPossible} pts</span></div></div>
        <span class="g-due">{dueText(assignment)}</span>
      </div>) : <p class="g-small">Nothing is due. Enjoy the breathing room.</p>}
    </section>
    {result.plan.length > 0 && <section class="g-card soft" aria-label="Suggested study split">
      <div class="g-section-head"><h2>Your {PLAN_HOURS}-hour study split</h2><Icon name="clock" size={20}/></div>
      {result.plan.slice(0, 5).map(item => <div key={item.name} class="g-demo-row">
        <div class="g-demo-row-main"><strong>{item.name}</strong><small class="g-small">{item.code}</small><span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${item.hours / PLAN_HOURS * 100}%` }}/></span></div>
        <span class="g-due normal">{item.hours.toFixed(1)} hrs</span>
      </div>)}
      <p class="g-small">Scenario-based suggestion, not a guaranteed grade.</p>
    </section>}
  </StagedRun>;
}

export function AssistantDemo({ onDone }: { onDone?: () => void }) {
  const steps: DemoStep[] = [
    { title: 'Integrity check', detail: 'Homework, not a quiz or timed assessment', ms: 900, ticks: ['Checking the assignment type…', 'Clear: reference guide only, never submitted'] },
    { title: 'Reading the assignment', detail: `${savedDemo.courseCode} · ${savedDemo.assignmentName}`, ms: 1300, ticks: ['Opening the instructions…', 'Pulling out what is being asked…'] },
    { title: 'Gathering course materials', detail: `${packet.sources.length} matching sources found`, ms: 1700, ticks: ['Searching the study guide…', 'Matching lecture notes…', `${packet.sources.length} sources matched`] },
    { title: 'Drafting with the local model', detail: 'A step-by-step worked guide', ms: 3200, ticks: ['Outlining the approach…', 'Working through part 1…', 'Working through part 2…', 'Plotting the response…'] },
    { title: 'Checking every step', detail: 'Each claim tied to a course source', ms: 1500, ticks: ['Verifying citations…', 'Rendering the graph…'] },
  ];
  return <StagedRun label="Homework Autopilot" steps={steps} onDone={onDone}>
    <div class="ja"><style>{ASSISTANT_STYLES}</style>
      <section class="ja-result" aria-label="Prepared study guide">
        <header class="ja-result-header"><h2>{packet.title}</h2><p>{packet.summary}</p></header>
        <div class="ja-result-body">
          <ComputedVisuals packet={packet}/>
          <details open><summary>Worked guide</summary><GroundedMarkdown text={packet.sampleMarkdown} sources={packet.sources}/></details>
        </div>
      </section>
    </div>
  </StagedRun>;
}

const FALLBACK_TOPICS = ['Algorithms', 'Data science', 'Computational biology'];
type Field = 'computing' | 'biology' | 'mathematics' | 'general';
interface Programme { name: string; host: string; url: string; field: Field }
const PROGRAMMES: Programme[] = [
  { field: 'computing', name: 'REU CAAR: Combinatorics, Algorithms and AI for Real Problems', host: 'University of Maryland', url: 'https://www.cs.umd.edu/projects/reucaar/' },
  { field: 'computing', name: 'Research Experiences for Undergraduates in Software Engineering (REUSE)', host: 'Carnegie Mellon University', url: 'https://www.cmu.edu/scs/isr/reuse/' },
  { field: 'biology', name: 'Amgen Scholars Program', host: 'Amgen Foundation · partner universities', url: 'https://amgenscholars.com/' },
  { field: 'biology', name: 'Undergraduate Research Program (URP)', host: 'Cold Spring Harbor Laboratory', url: 'https://www.cshl.edu/education/undergraduate-research-program/' },
  { field: 'biology', name: 'Summer Student Program', host: 'The Jackson Laboratory', url: 'https://www.jax.org/education-and-learning/high-school-students-and-undergraduates' },
  { field: 'mathematics', name: 'SMALL Undergraduate Research Project', host: 'Williams College', url: 'https://math.williams.edu/small/' },
  { field: 'mathematics', name: 'Summer Undergraduate Applied Mathematics Institute (SUAMI)', host: 'Carnegie Mellon University', url: 'https://www.cmu.edu/math/undergrad/suami/' },
  { field: 'mathematics', name: 'Polymath Jr', host: 'Online · multiple universities', url: 'https://geometrynyc.wixsite.com/polymathreu' },
  { field: 'general', name: 'Summer Undergraduate Research Fellowships (SURF)', host: 'California Institute of Technology', url: 'https://sfp.caltech.edu/undergraduate-research/programs/surf' },
  { field: 'general', name: 'MIT Summer Research Program (MSRP)', host: 'Massachusetts Institute of Technology', url: 'https://oge.mit.edu/msrp/' },
];
function fieldOf(topic: string): Field {
  if (/comput|algorithm|software|data|machine|artificial|network|program/i.test(topic)) return 'computing';
  if (/bio|genet|molec|cell|neuro|ecolog|chem/i.test(topic)) return 'biology';
  if (/math|statist|probab|combinator|geometr|algebra/i.test(topic)) return 'mathematics';
  return 'general';
}
function matchProgrammes(topics: string[], limit = 5): { programme: Programme; topic: string }[] {
  const picked: { programme: Programme; topic: string }[] = [];
  const used = new Set<string>();
  for (let round = 0; round < 3 && picked.length < limit; round++) {
    for (const topic of [...topics, 'research']) {
      if (picked.length >= limit) break;
      const field = topic === 'research' ? 'general' : fieldOf(topic);
      const programme = PROGRAMMES.find(p => p.field === field && !used.has(p.url));
      if (programme) { used.add(programme.url); picked.push({ programme, topic }); }
    }
  }
  return picked;
}

export function ResearchDemo({ snapshot, onDone }: { snapshot: CanvasSnapshot; onDone?: () => void }) {
  const context = useMemo(() => getAcademicContext(snapshot), [snapshot]);
  const topics = context.research.interests.map(item => item.topic);
  const shown = (topics.length ? topics : FALLBACK_TOPICS).slice(0, 3);
  const skills = context.research.skills.map(skill => skill.name).slice(0, 6);
  const matches = matchProgrammes(shown);
  const steps: DemoStep[] = [
    { title: 'Reading your courses', detail: `${snapshot.courses.length} syllabi and course pages`, ms: 1300, ticks: snapshot.courses.map(c => `Reading ${c.code}…`) },
    { title: 'Finding your interests', detail: shown.join(' · '), ms: 1500, ticks: ['Spotting recurring topics…', 'Linking topics to your skills…'] },
    { title: 'Searching programme listings', detail: 'Public REU directories and university pages', ms: 2600, ticks: ['Querying public REU listings…', 'Reading 14 programme pages…', 'Checking eligibility and funding…'] },
    { title: 'Matching to your profile', detail: 'Ranked by topic and skill overlap', ms: 1300, ticks: ['Scoring overlap…', 'Ranking matches…'] },
  ];
  return <StagedRun label="Research" steps={steps} onDone={onDone}>
    <section class="g-card" aria-label="Research profile">
      <div class="g-section-head"><h2>Your research profile</h2></div>
      <div class="g-demo-chips">{shown.map(topic => <span key={topic} class="g-demo-chip topic">{topic}</span>)}{skills.map(skill => <span key={skill} class="g-demo-chip">{skill}</span>)}</div>
      <p class="g-small">Read from your own course pages and syllabi.</p>
    </section>
    <section class="g-card" aria-label="Example programme matches">
      <div class="g-section-head"><h2>Programme matches</h2><span class="g-label-count">{matches.length} programmes</span></div>
      {matches.map(({ programme, topic }, i) => <a key={programme.url} class="g-demo-match" href={programme.url} target="_blank" rel="noopener noreferrer" aria-label={`${programme.name}, ${programme.host} (opens in a new tab)`}>
        <div class="g-demo-match-score" style={{ '--score': 94 - i * 6 }}><strong>{94 - i * 6}%</strong><small>match</small></div>
        <div class="g-demo-row-main"><strong>{programme.name}</strong><small class="g-small">{programme.host}</small><small class="g-demo-why">{topic === 'research' ? 'Broad summer research across fields' : `Matches your interest in ${topic.toLowerCase()}`}</small></div>
        <span class="g-demo-open" aria-hidden="true"><Icon name="external" size={16}/></span>
      </a>)}
      <p class="g-small">Match scores are illustrative for the presentation. Check each programme’s website for current dates and eligibility.</p>
    </section>
  </StagedRun>;
}

export function AutomationDemo({ snapshot, onReplay, onDone }: { snapshot?: CanvasSnapshot; onReplay?: () => void; onDone?: () => void }) {
  const steps: DemoStep[] = [
    { title: 'Starting a sandboxed browser', detail: 'Read-only · local Canvas copy', ms: 1200, ticks: ['Launching the sandbox…', 'Sandbox ready · read-only'] },
    { title: 'Opening the course', detail: 'GRADIENT-SIGNALS · Signals and Systems', ms: 1300, ticks: ['Loading the dashboard…', 'Opening GRADIENT-SIGNALS…'] },
    { title: 'Finding the homework', detail: `Assignments → ${savedDemo.assignmentName}`, ms: 1500, ticks: ['Opening Assignments…', 'Scanning the list…', `Found ${savedDemo.assignmentName}`] },
    { title: 'Reading the instructions', detail: 'Delayed response and the requested graph', ms: 1600, ticks: ['Reading the prompt…', 'Noting the graph requirements…'] },
    { title: 'Preparing the assignment', detail: 'Worked solution and plot', ms: 1900, ticks: ['Working the solution…', 'Rendering the plot…', 'Packaging the evidence…'] },
  ];
  return <StagedRun label="Automation" steps={steps} onDone={onDone}><AutomationPresentationDemo snapshot={snapshot} onReplay={onReplay}/></StagedRun>;
}
