import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasCourseSnapshot, CanvasLiveAssignment, CanvasSnapshot } from '../liveCanvas.js';
import { explainPlainly, loadAssistantSettings } from '../assistantClient.js';
import { daysUntil, dueTime, gradeRange, isGraded, isOverdue, isPending, isSubmitted, letterFor, LOCALE, numbersGrounded, relativeDue, shortDate, standingWord, type Briefing } from '../plainLanguage.js';
import { COURSE_COLOURS } from './palette.js';
import { Icon } from './Icons.js';

export type Task = { course: CanvasCourseSnapshot; assignment: CanvasLiveAssignment };
export const courseColour = (snapshot: CanvasSnapshot, courseId: string) => COURSE_COLOURS[Math.max(0, snapshot.courses.findIndex(c => c.id === courseId)) % COURSE_COLOURS.length]!;
const pct = (n: number | null | undefined, digits = 1) => n == null ? '–' : `${n.toFixed(digits)}%`;

/** Built-in reading first; the local model only offers a gentler rewording of the same facts. */
export function PlainExplainer({ topic, briefing, label = 'Explain this more simply' }: { topic: 'overview' | 'course'; briefing: Briefing; label?: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'done' | 'error'; text?: string; model?: string }>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const key = JSON.stringify(briefing.facts);
  useEffect(() => { controller.current?.abort(); setState({ status: 'idle' }); }, [key]);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setState({ status: 'busy' });
    try {
      const settings = await loadAssistantSettings();
      const text = await explainPlainly(settings, topic, briefing.facts, abort.signal);
      if (abort.signal.aborted) return;
      if (!numbersGrounded(text, briefing.facts)) throw new Error('The local model added figures Canvas did not provide, so only the summary above is shown.');
      setState({ status: 'done', text, model: settings.reasoningModel });
    } catch (error) {
      if (abort.signal.aborted) return;
      const message = error instanceof Error ? error.message : '';
      setState({ status: 'error', text: /reach|running|took too long|Ollama/i.test(message) ? 'Your local AI isn’t running, so nothing was sent anywhere. The summary above is calculated directly from Canvas.' : message || 'The local model could not reword this. The summary above is still accurate.' });
    }
  };
  return <div class="g-explain">
    {state.status === 'done' ? <div class="g-explain-result" aria-live="polite">
      <p>{state.text}</p>
      <small><Icon name="shield" size={13}/>Reworded on this computer by {state.model}. Every figure was checked against Canvas.</small>
    </div> : <button class="g-explain-btn" onClick={run} disabled={state.status === 'busy'} aria-busy={state.status === 'busy'}>
      {state.status === 'busy' ? <><span class="g-dots" aria-hidden="true"><i/><i/><i/></span>Your local AI is writing…</> : <><Icon name="spark" size={14}/>{label}</>}
    </button>}
    {state.status === 'busy' && <button class="g-link-btn g-explain-cancel" onClick={() => { controller.current?.abort(); setState({ status: 'idle' }); }}>Cancel</button>}
    {state.status === 'error' && <p class="g-explain-note" role="status">{state.text}</p>}
  </div>;
}

export function WorkStatus({ tasks }: { tasks: Task[] }) {
  const now = Date.now();
  const segments = [
    { id: 'overdue', label: 'Overdue', hint: 'Past the deadline and not handed in', count: tasks.filter(t => isOverdue(t.assignment, now)).length },
    { id: 'todo', label: 'Still to do', hint: 'Not handed in yet, deadline still ahead', count: tasks.filter(t => isPending(t.assignment) && !isOverdue(t.assignment, now)).length },
    { id: 'submitted', label: 'Handed in', hint: 'Waiting for your lecturer to mark', count: tasks.filter(t => isSubmitted(t.assignment)).length },
    { id: 'graded', label: 'Marked', hint: 'Marked and counted in your grade', count: tasks.filter(t => isGraded(t.assignment)).length },
  ];
  const total = segments.reduce((n, s) => n + s.count, 0) || 1;
  const finished = segments[2]!.count + segments[3]!.count;
  return <section class="g-card g-status" aria-label="Progress through this term’s work">
    <div class="g-section-head"><div><span class="g-eyebrow">Term progress</span><h2>{Math.round(finished / total * 100)}% of your work is handed in</h2></div></div>
    <div class="g-status-bar" role="img" aria-label={segments.map(s => `${s.label}: ${s.count}`).join(', ')}>
      {segments.filter(s => s.count).map((s, i) => <i key={s.id} class={s.id} style={{ flexGrow: s.count, animationDelay: `${i * 80}ms` }} title={`${s.label}: ${s.count}`}/>)}
    </div>
    <ul class="g-status-legend">{segments.map(s => <li key={s.id} class={s.id} title={s.hint}><i aria-hidden="true"/><span>{s.label}</span><strong>{s.count}</strong></li>)}</ul>
  </section>;
}

/** Fourteen calendar days; block height is the points at stake, colour is the course. */
export function WorkloadChart({ snapshot, tasks }: { snapshot: CanvasSnapshot; tasks: Task[] }) {
  const [active, setActive] = useState<number | null>(null);
  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const from = new Date(start); from.setDate(start.getDate() + i);
      const to = new Date(from); to.setDate(from.getDate() + 1);
      const items = tasks.filter(t => isPending(t.assignment) && dueTime(t.assignment) >= Math.max(from.getTime(), Date.now()) && dueTime(t.assignment) < to.getTime());
      return { date: from, items, points: items.reduce((n, t) => n + Math.max(t.assignment.pointsPossible, 1), 0) };
    });
  }, [tasks]);
  const overdue = tasks.filter(t => isOverdue(t.assignment));
  const max = Math.max(50, ...days.map(d => d.points));
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const heaviest = days.reduce((best, d) => d.points > best.points ? d : best, days[0]!);
  const usedCourses = snapshot.courses.filter(c => days.some(d => d.items.some(t => t.course.id === c.id)));
  const detail = active == null ? null : days[active]!;
  return <section class="g-card g-workload" aria-label="Deadlines over the next fourteen days">
    <div class="g-section-head"><div><span class="g-eyebrow">Next fortnight</span><h2>{total ? `${total} ${total === 1 ? 'deadline' : 'deadlines'} in the next 14 days` : 'No deadlines in the next 14 days'}</h2></div></div>
    <div class="g-chart-frame" onMouseLeave={() => setActive(null)}>
      <div class="g-workload-grid" aria-hidden="true"><span/><span/><span/></div>
      <div class="g-workload-cols">{days.map((d, i) => {
        const weekend = d.date.getDay() === 0 || d.date.getDay() === 6;
        return <button key={i} class={`g-wl-col${i === 0 ? ' today' : ''}${weekend ? ' weekend' : ''}${active === i ? ' active' : ''}${d.items.length ? '' : ' empty'}`}
          onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
          aria-label={`${d.date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}: ${d.items.length ? d.items.map(t => `${t.assignment.name}, ${t.course.code}, ${t.assignment.pointsPossible} points`).join('; ') : 'nothing due'}`}>
          <span class="g-wl-area"><span class="g-wl-stack" style={{ height: `${d.points / max * 100}%`, animationDelay: `${i * 35}ms` }}>
            {d.items.map((t, j) => <i key={j} style={{ flexGrow: Math.max(t.assignment.pointsPossible, 1), background: courseColour(snapshot, t.course.id) }}/>)}
          </span></span>
          <span class="g-wl-day">{i === 0 ? 'Today' : d.date.toLocaleDateString(LOCALE, { weekday: 'narrow' })}</span>
          <span class="g-wl-date">{d.date.getDate()}</span>
        </button>;
      })}</div>
      {detail && <div class="g-tooltip" style={{ left: `${Math.min(78, Math.max(22, (active! + .5) / 14 * 100))}%` }} role="status">
        <strong>{detail.date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        {detail.items.length ? detail.items.map((t, j) => <span key={j}><i style={{ background: courseColour(snapshot, t.course.id) }}/>{t.assignment.name}<em>{t.assignment.pointsPossible} pts</em></span>) : <span class="none">Nothing due — a good day to get ahead.</span>}
      </div>}
    </div>
    <div class="g-chart-foot">
      {usedCourses.length > 0 && <ul class="g-legend">{usedCourses.map(c => <li key={c.id}><i style={{ background: courseColour(snapshot, c.id) }}/>{c.code}</li>)}</ul>}
      <p class="g-small">{overdue.length ? `Plus ${overdue.length} overdue ${overdue.length === 1 ? 'piece' : 'pieces'} not shown. ` : ''}{heaviest.points && total > 1 ? `Busiest day: ${heaviest.date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })}. ` : ''}Taller blocks are worth more points.</p>
    </div>
  </section>;
}

const SCALE_MIN = 50;
const place = (n: number) => `${(Math.min(100, Math.max(SCALE_MIN, n)) - SCALE_MIN) / (100 - SCALE_MIN) * 100}%`;
function GradeTrack({ course, colour, large = false }: { course: CanvasCourseSnapshot; colour: string; large?: boolean }) {
  const range = gradeRange(course);
  const current = range.current;
  return <div class={`g-track${large ? ' large' : ''}`}>
    <div class="g-track-bands" aria-hidden="true"><i class="d"/><i class="c"/><i class="b"/><i class="a"/></div>
    {range.floor != null && range.ceiling != null && range.remainingPoints > 0 && <span class="g-track-range" style={{ left: place(range.floor), right: `calc(100% - ${place(range.ceiling)})`, '--course': colour }} title={`Final mark can still land between ${pct(range.floor)} and ${pct(range.ceiling)}`}/>}
    {current != null && <span class="g-track-dot" style={{ left: place(current), '--course': colour }}><b>{pct(current)}</b></span>}
  </div>;
}

/** Each course on the same grade scale, with the band it sits in and how far its final mark can still move. */
export function StandingChart({ snapshot, onOpen }: { snapshot: CanvasSnapshot; onOpen: (courseId: string) => void }) {
  const courses = snapshot.courses;
  if (!courses.length) return null;
  return <section class="g-card g-standing" aria-label="Where you stand in each course">
    <div class="g-section-head"><div><span class="g-eyebrow">Where you stand</span><h2>Your marks on one scale</h2></div></div>
    <div class="g-standing-rows">{courses.map(course => {
      const colour = courseColour(snapshot, course.id);
      const letter = letterFor(course, course.currentScore);
      return <button key={course.id} class="g-standing-row" onClick={() => onOpen(course.id)} aria-label={`${course.code}: ${pct(course.currentScore)}, ${standingWord(course.currentScore)}. Open coursework.`}>
        <span class="g-standing-name"><i style={{ background: colour }}/><strong>{course.code}</strong><small>{standingWord(course.currentScore)}</small></span>
        <GradeTrack course={course} colour={colour}/>
        <span class="g-standing-letter">{letter ?? '–'}</span>
      </button>;
    })}</div>
    <div class="g-track-axis" aria-hidden="true"><span/><span style={{ left: place(60) }}>60</span><span style={{ left: place(70) }}>70</span><span style={{ left: place(80) }}>80</span><span style={{ left: place(90) }}>90</span><span style={{ left: '100%' }}>100</span><span/></div>
    <ul class="g-legend g-standing-key"><li><i class="dot"/>Your mark now</li><li><i class="range"/>Where your final mark can still land</li><li><i class="bands"/>Shaded zones: D, C, B, A</li></ul>
  </section>;
}

/** A course's marked work in order, so a dip or a run of strong results is visible at a glance. */
export function ResultStrip({ course, colour }: { course: CanvasCourseSnapshot; colour: string }) {
  const results = course.assignments.filter(a => a.submission?.score != null && a.pointsPossible > 0 && !a.submission.excused)
    .sort((a, b) => dueTime(a) - dueTime(b)).slice(-8)
    .map(a => ({ name: a.name, value: Math.min(110, a.submission!.score! / a.pointsPossible * 100) }));
  if (!results.length) return <span class="g-strip empty">No marks yet</span>;
  return <span class="g-strip" role="img" aria-label={`Recent marks: ${results.map(r => `${r.name} ${Math.round(r.value)}%`).join(', ')}`}>
    {results.map((r, i) => <i key={i} title={`${r.name}: ${Math.round(r.value)}%`} class={r.value < 70 ? 'low' : ''} style={{ height: `${Math.max(12, (Math.min(100, r.value) - 40) / 60 * 100)}%`, background: r.value < 70 ? undefined : colour, animationDelay: `${i * 40}ms` }}/>)}
  </span>;
}

export function CourseList({ snapshot, onOpen }: { snapshot: CanvasSnapshot; onOpen: (courseId: string) => void }) {
  return <section class="g-courses" aria-label="Your courses"><div class="g-section-head"><h2 class="g-h-sans">Courses</h2><span class="g-label-count">{snapshot.courses.length}</span></div>
    <div class="g-course-list">{snapshot.courses.map(course => {
      const colour = courseColour(snapshot, course.id);
      const todo = course.assignments.filter(isPending).length;
      return <button key={course.id} class="g-course" style={{ '--course': colour }} onClick={() => onOpen(course.id)}>
        <span class="g-course-info"><span class="g-course-code">{course.code}</span><strong>{course.name.replace(/\s*\(Synthetic\)\s*$/, '')}</strong><small>{todo ? `${todo} still to do` : 'Nothing outstanding'}</small></span>
        <ResultStrip course={course} colour={colour}/>
        <span class="g-course-score"><strong>{pct(course.currentScore)}</strong><small>{letterFor(course, course.currentScore) ?? 'No grade'}</small></span>
      </button>;
    })}</div></section>;
}

/** The selected course's grade, its letter, and the full range its final mark can still reach. */
export function GradeHero({ snapshot, course }: { snapshot: CanvasSnapshot; course: CanvasCourseSnapshot }) {
  const range = gradeRange(course);
  const colour = courseColour(snapshot, course.id);
  const letter = letterFor(course, range.current);
  return <div class="g-grade-hero" style={{ '--course': colour }}>
    <div class="g-grade-hero-top">
      <div><span class="g-eyebrow">{course.code} · current mark</span><div class="g-grade-figure"><strong>{pct(range.current)}</strong>{letter && <span class="g-letter">{letter}</span>}</div><p>{standingWord(range.current)}{range.current != null ? ' · counts marked work only' : ''}</p></div>
      <dl class="g-grade-facts"><div><dt>Still to do</dt><dd>{course.assignments.filter(isPending).length}</dd></div><div><dt>Points left</dt><dd>{range.remainingPoints}</dd></div></dl>
    </div>
    <GradeTrack course={course} colour={colour} large/>
    <div class="g-track-axis" aria-hidden="true"><span/><span style={{ left: place(60) }}>60</span><span style={{ left: place(70) }}>70</span><span style={{ left: place(80) }}>80</span><span style={{ left: place(90) }}>90</span><span style={{ left: '100%' }}>100</span><span/></div>
  </div>;
}

export function gradeImpactLabel(impact: number | null): string {
  if (impact === null) return 'Grade impact unavailable';
  if (impact === 0) return 'No grade impact';
  const weight = impact < 0.1 ? '<0.1' : Number(impact.toFixed(1)).toString();
  return `${weight}% grade impact`;
}

export function TaskRow({ task, snapshot, onSelect, gradeImpact, dueLabel }: {
  task: Task;
  snapshot: CanvasSnapshot;
  onSelect?: () => void;
  gradeImpact?: number | null;
  dueLabel?: string;
}) {
  const { course, assignment: a } = task;
  const overdue = isOverdue(a);
  const time = dueTime(a);
  const urgent = overdue || (isPending(a) && Number.isFinite(time) && daysUntil(time) <= 1);
  const status = a.submission?.excused ? 'Excused' : a.submission?.score != null ? `${a.submission.score} / ${a.pointsPossible}` : isSubmitted(a) ? 'Handed in' : a.submission?.workflowState === 'graded' ? 'Marked · score hidden' : null;
  return <div class="g-task" style={{ '--course': courseColour(snapshot, course.id) }}>
    <span class="g-task-marker" aria-hidden="true"/>
    <div class="g-task-main"><strong>{onSelect ? <button onClick={onSelect}>{a.name}</button> : <a href={a.htmlUrl}>{a.name}</a>}</strong>
      <div class="g-task-meta"><span>{course.code}</span><span>{gradeImpact === undefined ? `${a.pointsPossible} pts` : gradeImpactLabel(gradeImpact)}</span>{status && <span>{status}</span>}</div></div>
    <span class={`g-due${urgent ? '' : ' normal'}${overdue ? ' late' : ''}`}>{dueLabel ?? (isPending(a) ? relativeDue(a) : Number.isFinite(time) ? shortDate(time) : 'No date')}</span>
  </div>;
}
