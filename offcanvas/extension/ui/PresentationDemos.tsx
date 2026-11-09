import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import savedStudyPacket from '../fixtures/ce240_homework2_study.json';
import { getAcademicContext } from '../academicContext.js';
import { syntheticCanvasTime } from '../canvasTime.js';
import { gradeInsight, markScale, type GradeInsight } from '../gradeInsight.js';
import { allocateStudySplit, type StudySplitCourse, type StudySplitItem } from '../studySplit.js';
import { getAssignmentPriorities } from '../assignmentPriorities.js';
import { relativeDue } from '../plainLanguage.js';
import { packetSchema } from '../assistantClient.js';
import type { CanvasCourseSnapshot, CanvasSnapshot } from '../liveCanvas.js';
import { AutomationPresentationDemo } from './AutomationPresentationDemo.js';
import { canAutomateCurrentPage, getPageAutomation } from '../pageAutomation.js';
import { getPageDemoTarget, startPageDemo } from '../pageDemo.js';
import { GroundedMarkdown } from './AssistantView.js';
import { courseColour, gradeImpactLabel } from './Dashboard.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';
import { Icon } from './Icons.js';
import { PanicAutomationDemo } from './PanicAutomationDemo.js';
import { ComputedVisuals } from './WorkEvidence.js';

export interface DemoStep { title: string; detail: string; ms: number; ticks?: string[] }

const STUDY_DEMO = {
  course: { id: 'ce240', code: 'CE 240', name: 'Signals and Systems' },
  assignment: { id: 'homework-2', name: 'Homework 2 - Trapezoidal Piecewise-Linear Waveforms' },
  mode: 'explain',
  level: 'all_in',
} as const;
const studyPacket = packetSchema.parse(savedStudyPacket);
const PLAN_HOURS = 8;

function clock(ms: number): string { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${Math.floor(ms / 100) % 10}`; }

function TimeOnCanvas({ snapshot, grades }: { snapshot: CanvasSnapshot; grades: { course: CanvasCourseSnapshot; insight: GradeInsight }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const report = useMemo(() => syntheticCanvasTime(grades.map(({ course, insight }) => ({
    id: course.id, code: course.code, floor: insight.floor, ceiling: insight.ceiling,
  }))), [grades]);
  const detail = active == null ? null : report.days[active]!;
  return <section class="g-card g-demo-time" aria-label="Time on Canvas">
    <div class="g-section-head"><h2>Time on Canvas</h2><Icon name="clock" size={20}/></div>
    <p class="g-demo-metric-score"><b>{report.total.toFixed(1)}</b><span>h</span></p>
    <div class="g-demo-time-chart" onMouseLeave={() => setActive(null)}>
      <div class="g-demo-time-grid" aria-hidden="true"><span/><span/><span/></div>
      <div class="g-demo-time-cols">{report.days.map((day, index) => <button key={day.aria} type="button" class={`g-demo-time-col${index === report.days.length - 1 ? ' today' : ''}${day.weekday === 0 || day.weekday === 6 ? ' weekend' : ''}${active === index ? ' active' : ''}${day.total ? '' : ' empty'}`}
        onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} aria-label={day.aria}>
        <span class="g-demo-time-area">{day.total > 0 && <span class="g-demo-time-stack" style={{ height: `${report.peak ? day.total / report.peak * 100 : 0}%`, animationDelay: `${index * 35}ms` }}>
          {day.slices.filter(slice => slice.hours > 0).map(slice => <i key={slice.id} style={{ flexGrow: slice.hours, background: courseColour(snapshot, slice.id) }}/>)}
        </span>}</span>
        <span class="g-demo-time-day">{day.label}</span>
        <span class="g-demo-time-date">{day.date}</span>
      </button>)}</div>
      {detail && <div class="g-tooltip" style={{ left: `${Math.min(78, Math.max(22, (active! + .5) / report.days.length * 100))}%` }} role="status">
        <strong>{detail.title}{detail.total > 0 && <em>Total {detail.total.toFixed(1)}h</em>}</strong>
        {detail.slices.filter(slice => slice.hours > 0).map(slice => <span key={slice.id}><i style={{ background: courseColour(snapshot, slice.id) }}/>{slice.code}<em>{slice.hours.toFixed(1)}h</em></span>)}
        {!detail.total && <span class="none">No time on Canvas.</span>}
      </div>}
    </div>
    <ul class="g-legend">{report.courses.map(course => <li key={course.id}><i style={{ background: courseColour(snapshot, course.id) }}/>{course.code}<span>{course.hours.toFixed(1)}h</span></li>)}</ul>
    <p class="g-demo-metric-note">{report.note}</p>
    {report.aside && <p class="g-demo-metric-note">{report.aside}</p>}
  </section>;
}

/** Plays a scripted sequence of steps with varied timings, then reveals the prepared result. */
export function StagedRun({ label, steps, children, onDone, onRestart, scrollResult = true }: { label: string; steps: DemoStep[]; children: ComponentChildren; onDone?: () => void; onRestart?: () => void; scrollResult?: boolean }) {
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
    doneRef.current?.();
    if (!scrollResult) return;
    const timer = setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(timer);
  }, [done, run, scrollResult]);

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
        {done && <button class="g-link-btn" onClick={() => { onRestart?.(); setIndex(0); setRun(r => r + 1); }}>Run again <Icon name="refresh" size={14}/></button>}
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

export function AcademicsDemo({ snapshot, studyCourses, onDone, onReplay, onRestart }: {
  snapshot: CanvasSnapshot;
  studyCourses: StudySplitCourse[];
  onDone?: () => void;
  onReplay?: () => void;
  onRestart?: () => void;
}) {
  const [academicsComplete, setAcademicsComplete] = useState(false);
  const [planRun, setPlanRun] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (academicsComplete) doneRef.current?.();
  }, [academicsComplete]);
  const courses = snapshot.courses;
  const assignments = courses.flatMap(course => course.assignments.map(assignment => ({ course, assignment })));
  const materials = courses.reduce((n, course) => n + course.resources.length, 0);
  const result = useMemo(() => {
    const grades = courses.map(course => ({ course, insight: gradeInsight(course) }));
    const now = new Date();
    const priorities = getAssignmentPriorities(courses).filter(task => task.deadline > now.getTime()).slice(0, 3);
    let plan: StudySplitItem[] = [];
    let planError = false;
    try {
      plan = allocateStudySplit(studyCourses, PLAN_HOURS, now);
    } catch { planError = true; }
    const allocated = plan.reduce((total, item) => total + item.hours, 0);
    return { grades, priorities, now, plan, planError, allocated, unused: Math.max(0, PLAN_HOURS - allocated) };
  }, [snapshot, studyCourses, planRun]);
  const steps: DemoStep[] = [
    { title: 'Connecting to Canvas', detail: `Signed in as ${snapshot.user.shortName || snapshot.user.name} · read-only`, ms: 1100, ticks: ['Checking your session…', 'Session verified · read-only access'] },
    { title: 'Syncing your courses', detail: `${courses.length} courses · ${assignments.length} assignments · ${materials} materials`, ms: 2100, ticks: courses.map((c, i) => `Reading ${c.code} (${i + 1} of ${courses.length})…`) },
    { title: 'Rebuilding every grade', detail: 'Weights, drop rules and missing work applied', ms: 1500, ticks: ['Applying assignment-group weights…', 'Checking drop rules…', 'Comparing with Canvas totals…'] },
    { title: 'Ranking what to do next', detail: 'Final course grade impact first, then the deadline', ms: 1300, ticks: ['Estimating grade impact…', 'Comparing deadlines…'] },
    { title: 'Planning your study time', detail: `Splitting up to ${PLAN_HOURS} hours by effort, deadlines and grade impact`, ms: 1800, ticks: ['Checking how much time fits before each deadline…', 'Checking grade weights and drop rules…', 'Estimating time by assignment type…', 'Choosing the split…'] },
  ];
  return <>
    <PanicAutomationDemo onReplay={onReplay}/>
    <StagedRun label="Academics" steps={steps} scrollResult={false} onDone={() => setAcademicsComplete(true)}
      onRestart={() => { onRestart?.(); setAcademicsComplete(false); setPlanRun(previous => previous + 1); }}>
      <section class="g-card" aria-label="Rebuilt grades">
        <div class="g-section-head"><h2>What can still change</h2></div>
        <div class="g-demo-metrics">{result.grades.map(({ course, insight }) => {
          const colour = courseColour(snapshot, course.id);
          const low = insight.floor;
          const high = insight.ceiling;
          return <article key={course.id} class="g-demo-metric" style={{ '--course': colour }} aria-label={`${course.code}. ${insight.climb}. ${insight.stakes}.`}>
            <div class="g-demo-metric-top">
              <span class="g-demo-metric-code">{course.code}</span>
              {insight.matchesCanvas
                ? <span class="g-demo-ok"><Icon name="check" size={13}/>Matches Canvas</span>
                : insight.canvasPercentage != null && <span class="g-small">Canvas {insight.canvasPercentage.toFixed(1)}%</span>}
            </div>
            <p class="g-demo-metric-score"><b>{insight.percentage == null ? '–' : insight.percentage.toFixed(1)}</b>{insight.percentage != null && <span>%</span>}{insight.letter && <em>{insight.letter}</em>}</p>
            <div class="g-track" aria-hidden="true">
              <div class="g-track-bands"><i class="d"/><i class="c"/><i class="b"/><i class="a"/></div>
              {low != null && high != null && <span class="g-track-range" style={{ left: markScale(low), right: `calc(100% - ${markScale(high)})`, '--course': colour }}/>}
              {insight.percentage != null && <span class="g-track-dot" style={{ left: markScale(insight.percentage), '--course': colour }}/>}
            </div>
            <p class="g-demo-metric-note">{insight.climb}</p>
            <p class="g-demo-metric-note">{insight.stakes}</p>
          </article>;
        })}</div>
      </section>
      <TimeOnCanvas snapshot={snapshot} grades={result.grades}/>
      <section class="g-card" aria-label="Priorities">
        <div class="g-section-head"><h2>Do these first</h2></div>
        {result.priorities.length ? result.priorities.map(({ course, assignment, gradeImpact }, i) => <div key={`${course.id}:${assignment.id}`} class="g-task">
          <div class={`g-task-marker ${i === 0 ? 'urgent' : 'soon'}`}><span class="g-demo-rank">{i + 1}</span></div>
          <div class="g-task-main"><strong>{assignment.name}</strong><div class="g-task-meta"><span>{course.code}</span><span>{gradeImpactLabel(gradeImpact)}</span></div></div>
          <span class="g-due">{relativeDue(assignment, result.now)}</span>
        </div>) : <p class="g-small">Nothing is due. Enjoy the breathing room.</p>}
      </section>
      <section class="g-card soft" aria-label="Suggested study split">
        <div class="g-section-head"><h2>Study split for up to {PLAN_HOURS} hours</h2><Icon name="clock" size={20}/></div>
        {result.plan.map(item => <div key={item.id} class="g-demo-row">
          <div class="g-demo-row-main"><strong>{item.name}</strong><small class="g-small">{item.code} · {item.reason}</small><span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${item.hours / PLAN_HOURS * 100}%` }}/></span></div>
          <span class="g-due normal">{item.hours.toFixed(1)} hrs</span>
        </div>)}
        {result.planError ? <p class="g-notice" role="alert">The study split could not be calculated. Run the demo again.</p> : <>
          <p class="g-small" role="status">{result.allocated.toFixed(1)} of {PLAN_HOURS.toFixed(1)} hours allocated · {result.unused.toFixed(1)} hours unallocated.</p>
          {!result.plan.length && <p class="g-small">No study blocks fit this plan.</p>}
          <p class="g-small">Time estimates depend on the type of work. Blocks fit before deadlines, and undated work gets up to 30 minutes.</p>
          {result.plan.length > 0 && <p class="g-small">Full-credit estimates hold other scores fixed and count ungraded work as zero.</p>}
        </>}
      </section>
    </StagedRun>
  </>;
}

export function AssistantDemo({ onDone, onRestart }: { onDone?: () => void; onRestart?: () => void }) {
  const [run, setRun] = useState(0);
  const steps: DemoStep[] = [
    { title: 'Reading the assignment', detail: `${STUDY_DEMO.course.code} · ${STUDY_DEMO.assignment.name}`, ms: 1300, ticks: ['Opening Homework 2…', 'Identifying trapezoidal piecewise-linear waveforms…'] },
    { title: 'Gathering course materials', detail: `${studyPacket.sources.length} matching sources found`, ms: 1700, ticks: ['Reading the waveform study brief…', 'Matching the piecewise-linear study notes…', `${studyPacket.sources.length} sources matched`] },
    { title: 'Building the study packet', detail: 'Study mode · Go all in', ms: 2800, ticks: ['Explaining breakpoints and slopes…', 'Writing the piecewise equations…', 'Building the ramp-function representation…', 'Adding practice checks…'] },
    { title: 'Preparing the waveform diagram', detail: 'Labeled breakpoints, rising edge, plateau, and falling edge', ms: 1300, ticks: ['Plotting the illustrative trapezoidal waveform…', 'Labeling the vertices and segment slopes…'] },
    { title: 'Checking the packet', detail: 'Explanations and diagram tied to the study sources', ms: 1500, ticks: ['Verifying citations…', 'Checking the diagram and practice answers…'] },
  ];
  return <div class="ja g-stack"><style>{ASSISTANT_STYLES}</style>
    <section class="ja-inner ja-demo-setup" aria-label="Study packet demo setup">
      <header class="ja-head"><div class="ja-core" aria-hidden="true"><span><Icon name="spark" size={20}/></span></div><h1>AI Workspace</h1></header>
      <div class="ja-fields two">
        <label><span class="ja-label">Course</span><select class="ja-control" aria-label="Assistant course" value={STUDY_DEMO.course.id} disabled><option value={STUDY_DEMO.course.id}>{STUDY_DEMO.course.code} · {STUDY_DEMO.course.name}</option></select></label>
        <label><span class="ja-label">Assignment</span><select class="ja-control" aria-label="Assistant assignment" value={STUDY_DEMO.assignment.id} disabled><option value={STUDY_DEMO.assignment.id}>{STUDY_DEMO.assignment.name}</option></select></label>
      </div>
      <p class="ja-note">{STUDY_DEMO.assignment.name}</p>
      <div class="ja-detail" role="group" aria-label="Response detail level">{([{ id: 'a_bit', title: 'A bit' }, { id: 'a_bit_more', title: 'A bit more' }, { id: 'all_in', title: 'Go all in' }] as const).map(level => <button key={level.id} class={STUDY_DEMO.level === level.id ? 'active' : ''} aria-pressed={STUDY_DEMO.level === level.id} disabled><strong>{level.title}</strong></button>)}</div>
      <div class="ja-mode" role="group" aria-label="Assistant output type"><button class="ja-btn active" aria-pressed={STUDY_DEMO.mode === 'explain'} disabled>Study</button><button class="ja-btn" aria-pressed={false} disabled>Reference example</button></div>
      <button class="ja-btn primary full" onClick={() => { onRestart?.(); setRun(previous => previous + 1); }}><Icon name="spark" size={18}/>Build my study packet</button>
    </section>
    <StagedRun key={run} label="Study packet" steps={steps} onDone={onDone} onRestart={onRestart}>
      <section class="ja-result" aria-label="Prepared study guide">
        <header class="ja-result-header"><h2>{studyPacket.title}</h2><p>{studyPacket.summary}</p></header>
        <div class="ja-result-body">
          <ComputedVisuals packet={studyPacket}/>
          <GroundedMarkdown text={studyPacket.markdown} sources={studyPacket.sources}/>
        </div>
      </section>
    </StagedRun>
  </div>;
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
  const liveReplay = !!snapshot && snapshot.origin === location.origin && canAutomateCurrentPage() &&
    !!getPageDemoTarget(snapshot) && getPageAutomation()?.status !== 'running';
  useEffect(() => {
    if (!liveReplay || !snapshot) { onDone?.(); return; }
    startPageDemo(snapshot);
    onReplay?.();
  }, []);
  if (liveReplay) return <p role="status">Opening the demo in the main Canvas window…</p>;
  return <section aria-label="Automation demo run"><AutomationPresentationDemo snapshot={snapshot}/></section>;
}
