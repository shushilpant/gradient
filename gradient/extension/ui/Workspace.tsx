import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot, CanvasCourseSnapshot, CanvasLiveAssignment } from '../liveCanvas.js';
import { currentGrade } from '../../core/gradeModel.js';
import { optimizeEffort, type OptimizerResult } from '../../core/optimiser.js';
import { loadOptions, saveOptions } from '../options/optionsStorage.js';
import { WORKSPACE_STYLES, ASSISTANT_ENTRY_STYLES } from './workspaceStyles.js';
import { Icon } from './Icons.js';
import { MaterialAccess } from './MaterialAccess.js';
import { AssistantView } from './AssistantView.js';
import { DeadlineTracker } from './DeadlineTracker.js';

export interface WorkspaceProps {
  snapshot: CanvasSnapshot | null;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  initialCourseId?: string;
  initialAssignmentId?: string;
  progress?: string;
  preview?: boolean;
}
type Tab = 'overview' | 'assistant' | 'coursework' | 'resources' | 'settings';
type Task = { course: CanvasCourseSnapshot; assignment: CanvasLiveAssignment };
const colors = [
  { tint: '#edf2ff', ink: '#175b4c' }, { tint: '#fff0e8', ink: '#a84726' },
  { tint: '#e6f5ee', ink: '#187352' }, { tint: '#f1eafd', ink: '#7950b9' },
  { tint: '#fff5d9', ink: '#87651b' }, { tint: '#e6f5fa', ink: '#22708c' },
];
function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(el => el.remove());
  doc.querySelectorAll('p,br,li,h1,h2,h3').forEach(el => el.append(doc.createTextNode('\n')));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
function safeLink(value: string): string {
  try { const url = new URL(value, window.location.origin); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; }
  catch { return '#'; }
}
function score(value: number | null | undefined): string { return value == null ? '—' : `${value.toFixed(1)}%`; }
function pending(a: CanvasLiveAssignment): boolean { return !a.submission?.excused && a.submission?.score == null && a.submission?.workflowState !== 'submitted' && a.submission?.workflowState !== 'pending_review' && a.submission?.workflowState !== 'graded'; }
function dueDate(a: CanvasLiveAssignment): number { return a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY; }
function dueLabel(a: CanvasLiveAssignment): string {
  if (!a.dueAt) return 'No due date';
  const date = new Date(a.dueAt);
  const now = new Date();
  if (!Number.isFinite(date.getTime())) return 'No due date';
  if (date.getTime() < now.getTime()) return 'Past due';
  // Compare calendar days in the user's timezone, not elapsed 24-hour windows.
  const dayKey = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (dayKey(date) - dayKey(now)) / 86400000;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function taskStatus(a: CanvasLiveAssignment): string {
  if (a.submission?.excused) return 'Excused';
  if (a.submission?.score != null) return `${a.submission.score} / ${a.pointsPossible} pts`;
  if (a.submission?.workflowState === 'graded') return 'Graded · score hidden';
  if (a.submission?.workflowState === 'submitted' || a.submission?.workflowState === 'pending_review') return 'Submitted';
  return 'To do';
}
function initials(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase(); }
function exportCalendar(tasks: Task[], origin: string): void {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GRADIENT//Canvas Coursework//EN', 'CALSCALE:GREGORIAN'];
  for (const { course, assignment: a } of tasks.filter(t => t.assignment.dueAt)) {
    const start = new Date(a.dueAt!);
    if (!Number.isFinite(start.getTime())) continue;
    lines.push('BEGIN:VEVENT', `UID:gradient-${course.id}-${a.id}@${new URL(origin).hostname}`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 15 * 60000))}`, `SUMMARY:${esc(a.name)}`, `DESCRIPTION:${esc(course.name + '\nAssignment deadline from Canvas.\n' + a.htmlUrl)}`, `URL:${safeLink(a.htmlUrl)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 physical lines must be folded at 75 UTF-8 octets.
  const folded = lines.map(line => { let result = '', count = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (count + bytes > 74) { result += '\r\n '; count = 1; } result += char; count += bytes; } return result; }).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([folded], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'gradient-canvas-deadlines.ics'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Empty({ title, children }: { title: string; children: string }) { return <div class="g-empty"><div class="g-empty-icon"><Icon name="check" size={22}/></div><h2>{title}</h2><p>{children}</p></div>; }
function TaskRow({ task, onSelect }: { task: Task; onSelect?: () => void }) {
  const { course, assignment: a } = task;
  return <div class="g-task"><div class="g-task-marker"><Icon name="book" size={15}/></div><div class="g-task-main"><strong>{onSelect ? <button class="g-link-btn" style={{ textAlign: 'left', color: 'inherit', fontSize: '12px', fontWeight: 650 }} onClick={onSelect}>{a.name}</button> : <a href={safeLink(a.htmlUrl)}>{a.name}</a>}</strong><div class="g-task-meta"><span>{course.code}</span><span>·</span><span>{a.pointsPossible} pts</span>{!pending(a) && <><span>·</span><span>{taskStatus(a)}</span></>}</div></div><span class={`g-due ${dueDate(a) > Date.now() + 2 * 86400000 || !a.dueAt ? 'normal' : ''}`}>{dueLabel(a)}</span></div>;
}

function AssignmentFeedback({ assignment }: { assignment: CanvasLiveAssignment }) {
  const rubric = assignment.rubric ?? [];
  const comments = assignment.submission?.submissionComments ?? [];
  const assessment = assignment.submission?.rubricAssessment ?? {};
  if (!rubric.length && !comments.length) return null;
  return <section class="g-card" aria-label="Assignment rubric and instructor feedback">
    <details>
      <summary class="g-feedback-summary"><span>Rubric & instructor feedback</span><span class="g-label-count">FROM CANVAS</span></summary>
      <p class="g-small" style={{ marginTop: '10px' }}>The criteria and feedback published for {assignment.name}.</p>
      {rubric.length > 0 && <div class="g-rubric-list">{rubric.map(criterion => {
        const assessed = assessment[criterion.id];
        return <div class="g-rubric-criterion" key={criterion.id}>
          <div class="g-section-head" style={{ marginBottom: '8px' }}><h3>{plain(criterion.description) || 'Rubric criterion'}</h3><span class="g-label-count">{criterion.points} pts</span></div>
          {assessed && <div class="g-notice info" style={{ marginBottom: '9px' }}><Icon name="check" size={14}/><div><strong>Instructor assessment: {assessed.points} / {criterion.points} pts</strong>{assessed.comments && <p style={{ marginTop: '4px' }}>{plain(assessed.comments)}</p>}</div></div>}
          {criterion.ratings.length > 0 && <details><summary class="g-ratings-summary">Rating descriptions</summary><ul class="g-rubric-ratings">{criterion.ratings.map((rating, i) => <li key={rating.id ?? i}><span>{plain(rating.description) || 'No description provided'}</span><strong>{rating.points} pts</strong></li>)}</ul></details>}
        </div>;
      })}</div>}
      {comments.length > 0 && <div class="g-feedback-comments"><h3>Submission comments</h3>{comments.map((comment, i) => <div class="g-instructor-comment" key={i}><div class="g-comment-author"><strong>{comment.authorName || 'Canvas user'}</strong>{comment.createdAt && Number.isFinite(Date.parse(comment.createdAt)) && <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>}</div><p>{plain(comment.comment)}</p></div>)}</div>}
    </details>
  </section>;
}

export function Workspace({ snapshot, loading, error, onRefresh, initialCourseId, initialAssignmentId, progress, preview = false }: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [assistantOpened, setAssistantOpened] = useState(false);
  useEffect(() => { if (tab === 'assistant') setAssistantOpened(true); }, [tab]);
  const assistantSnapshot = useRef<CanvasSnapshot | null>(null);
  if (snapshot) assistantSnapshot.current = snapshot;
  else if (!loading) assistantSnapshot.current = null;
  const [minimized, setMinimized] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const toggle = () => setMinimized(previous => !previous);
    window.addEventListener('gradient:toggle', toggle);
    return () => window.removeEventListener('gradient:toggle', toggle);
  }, []);
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId ?? '');
  const [query, setQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'todo' | 'submitted' | 'graded'>('todo');
  const [resourceFilter, setResourceFilter] = useState<'all' | 'module' | 'page' | 'file'>('all');
  const [assignmentId, setAssignmentId] = useState('');
  const [whatIf, setWhatIf] = useState(85);
  const [hours, setHours] = useState(8);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<OptimizerResult | null>(null);
  const [planError, setPlanError] = useState('');
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [creditError, setCreditError] = useState('');
  const courses = snapshot?.courses ?? [];
  const active = courses.find(c => c.id === selectedCourseId) ?? courses[0];
  useEffect(() => { if (initialCourseId) setSelectedCourseId(initialCourseId); }, [initialCourseId]);
  useEffect(() => {
    if (initialAssignmentId) { setAssignmentId(initialAssignmentId); setTab('coursework'); }
  }, [initialAssignmentId]);
  useEffect(() => { let mounted = true; loadOptions().then(o => { if (mounted) setCredits(o.courseCreditHours); }).catch(() => {}); return () => { mounted = false; }; }, []);
  useEffect(() => { setPlan(null); setPlanError(''); }, [snapshot, selectedCourseId, credits, hours]);
  const tasks = useMemo(() => courses.flatMap(course => course.assignments.map(assignment => ({ course, assignment }))).sort((a, b) => dueDate(a.assignment) - dueDate(b.assignment)), [snapshot]);
  const upcoming = tasks.filter(t => pending(t.assignment) && dueDate(t.assignment) >= Date.now());
  const dueThisWeek = upcoming.filter(t => dueDate(t.assignment) < Date.now() + 7 * 86400000);
  const submittedCount = tasks.filter(t => t.assignment.submission?.workflowState === 'submitted' || t.assignment.submission?.workflowState === 'pending_review').length;
  const activeTasks = tasks.filter(t => t.course.id === active?.id && t.assignment.name.toLowerCase().includes(query.toLowerCase())).filter(t => filter === 'all' || (filter === 'todo' && pending(t.assignment)) || (filter === 'submitted' && ['submitted', 'pending_review'].includes(t.assignment.submission?.workflowState ?? '')) || (filter === 'graded' && (t.assignment.submission?.score != null || t.assignment.submission?.workflowState === 'graded')));
  const simAssignment = active?.assignments.find(a => a.id === assignmentId) ?? active?.assignments.find(a => pending(a) && a.pointsPossible > 0) ?? active?.assignments.find(a => a.pointsPossible > 0);
  const simulated = useMemo(() => {
    if (!active || !simAssignment) return null;
    const otherSubmissions = active.input.submissions.filter(s => s.assignmentId !== simAssignment.id);
    return currentGrade({ ...active.input, submissions: [...otherSubmissions, { assignmentId: simAssignment.id, score: simAssignment.pointsPossible * whatIf / 100, posted: true, excused: false, missing: false, late: false, workflowState: 'graded' }] }).percentage;
  }, [active, simAssignment, whatIf]);
  const computed = useMemo(() => active ? currentGrade(active.input).percentage : null, [active]);
  const gradeMatches = active?.currentScore != null && computed != null && Math.abs(active.currentScore - computed) <= .01;
  const allIssues = [...(snapshot?.issues ?? []), ...courses.flatMap(c => c.issues)];
  const changeTab = (next: Tab) => { setTab(next); };
  const selectCourse = (id: string) => { setSelectedCourseId(id); setAssignmentId(''); setPlan(null); };
  const buildPlan = () => {
    if (!active || planning) return;
    setPlanning(true); setPlanError('');
    setTimeout(() => {
      try {
        const input = { ...active.input, studyEligibleAssignmentIds: active.assignments.filter(pending).map(assignment => assignment.id), course: { ...active.input.course, creditHours: credits[active.id] ?? 3 } };
        const result = optimizeEffort([input], { capacityHours: hours, stepSizeHours: .5, numSamples: 100, seed: 42, currentTime: new Date(), protectMastery: true, masteryFloorHours: .5, isRobustnessRun: true });
        setPlan(result);
      } catch (e) { setPlanError(e instanceof Error ? e.message : 'The study plan could not be calculated.'); }
      finally { setPlanning(false); }
    }, 30);
  };
  const saveCredit = (id: string, n: number) => {
    if (!Number.isFinite(n) || n <= 0 || n > 30) return;
    const next = { ...credits, [id]: n }; setCredits(next);
    saveOptions({ courseCreditHours: next }).catch(() => setCreditError('Your credit hours could not be saved. They will apply for this session.'));
  };
  const coursePicker = active ? <div class="g-course-menu"><select class="g-select" aria-label="Choose a course" value={active.id} onChange={e => selectCourse(e.currentTarget.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select><a class="g-icon-btn" href={safeLink(active.url)} title="Open course in Canvas" aria-label="Open course in Canvas"><Icon name="external" size={17}/></a></div> : null;

  return <><style>{WORKSPACE_STYLES + ASSISTANT_ENTRY_STYLES}</style>{minimized ? <button id="gradient-launcher" class="g-launcher" aria-label="Open GRADIENT" onClick={() => setMinimized(false)}><Icon name="chart" size={21}/>GRADIENT<Icon name="chevron" size={16}/></button> : <aside id="gradient-workspace" class={`gw ${wide ? 'wide' : ''}`} aria-label="GRADIENT Canvas workspace">
    <header class="g-header"><div class="g-brand"><div class="g-logo"><Icon name="chart" size={22}/></div><div><div class="g-wordmark">gradient<span style={{ color: '#175b4c' }}>.</span></div><div class="g-brand-sub">A workspace for the work</div></div></div><button class="g-icon-btn g-hide-mobile" aria-label={wide ? 'Compact workspace' : 'Expand workspace'} title={wide ? 'Compact workspace' : 'Expand workspace'} onClick={() => setWide(!wide)}><Icon name="expand" size={16}/></button><button class="g-icon-btn" aria-label="Refresh Canvas data" title="Refresh Canvas data" disabled={loading} onClick={onRefresh}><Icon name="refresh" size={16} className={loading ? 'g-spinner' : ''}/></button><button class="g-icon-btn" aria-label="Minimize GRADIENT" title="Minimize GRADIENT" onClick={() => setMinimized(true)}><Icon name="collapse" size={17}/></button></header>
    <div class="g-status"><span class="g-live"><i class={`g-dot ${preview ? 'g-demo-dot' : ''}`}/>{preview ? 'Demo preview' : loading && !snapshot ? 'Connecting to Canvas' : error && !snapshot ? 'Connection needed' : 'Canvas connected'}</span><span>{snapshot?.syncedAt ? `Synced ${new Date(snapshot.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Your account. Your workspace.'}</span></div>
    <nav class="g-nav" role="tablist" aria-label="Workspace views">{([{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'assistant', label: 'Assistant', icon: 'spark' }, { id: 'coursework', label: 'Coursework', icon: 'book' }, { id: 'resources', label: 'Resources', icon: 'folder' }, { id: 'settings', label: 'Settings', icon: 'settings' }] as const).map(item => <button key={item.id} id={`g-tab-${item.id}`} class={`g-tab ${tab === item.id ? 'active' : ''}`} role="tab" aria-selected={tab === item.id} aria-controls="gradient-tab-content" onClick={() => changeTab(item.id)}><Icon name={item.icon} size={15}/>{item.label}</button>)}</nav>
    <div id="gradient-tab-content" class="g-body" role="tabpanel" aria-labelledby={`g-tab-${tab}`}>
      {loading && <div class="g-sync-loading" role="status"><Icon name="refresh" size={14} className="g-spinner"/>{progress || 'Syncing your Canvas account…'}</div>}
      {error && <div class="g-notice" role="alert" style={{ marginBottom: '16px' }}><Icon name="alert" size={16}/><div>{error}<button class="g-link-btn" onClick={onRefresh} disabled={loading}>Try again <Icon name="arrow" size={12}/></button></div></div>}
      {!snapshot && loading ? <div class="g-stack"><div><div class="g-eyebrow">Canvas connection</div><h1 class="g-title">Bringing your<br/><span class="g-accent">coursework in.</span></h1><p class="g-subtitle">Connecting your courses, deadlines, and materials.</p></div><div class="g-skeleton"/><div class="g-skeleton"/><div class="g-skeleton"/></div> : !snapshot ? <Empty title="Let's connect your Canvas">Open Canvas and sign in, then refresh GRADIENT to see your courses here.</Empty> : <>
      {tab === 'overview' && <div class="g-stack"><div class="g-greeting"><div><div class="g-eyebrow">Semester overview</div><h1 class="g-title">A clearer view<br/>of <span class="g-accent">the work.</span></h1><p class="g-subtitle">Courses, deadlines, and your next assignment. In order.</p></div><span class="g-date">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
        <button class="g-assistant-entry" onClick={() => setTab('assistant')}><span class="g-assistant-entry-icon"><Icon name="spark" size={22}/></span><span><strong>From assignment brief to a considered answer.</strong><small>Read, research, and work through it with your local assistant.</small></span><Icon name="arrow" size={18}/></button><div class="g-metrics"><div class="g-metric blue"><strong>{courses.length.toString().padStart(2, '0')}</strong><small>Active courses</small></div><div class="g-metric peach"><strong>{dueThisWeek.length.toString().padStart(2, '0')}</strong><small>Due this week</small></div><div class="g-metric"><strong>{submittedCount.toString().padStart(2, '0')}</strong><small>Awaiting grades</small></div></div>
        <div class="g-overview-grid"><section><div class="g-section-head"><h2>Your courses</h2><span class="g-label-count">FROM CANVAS</span></div><div class="g-course-list">{courses.map((course, i) => { const color = colors[i % colors.length]!; return <button key={course.id} class="g-course" style={{ '--tint': color.tint, '--ink': color.ink }} onClick={() => { selectCourse(course.id); setTab('coursework'); }}><div class="g-course-symbol">{course.code.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}</div><div class="g-course-info"><strong>{course.name}</strong><small>{course.assignments.filter(pending).length} to do · {course.resources.length} resources</small><div class="g-track"><span style={{ width: `${Math.min(100, Math.max(0, course.currentScore ?? 0))}%` }}/></div></div><div class="g-course-score g-bold-number">{score(course.currentScore)}<small>current grade</small></div></button>; })}{!courses.length && <Empty title="No student courses found">Your active student enrollments will appear here when Canvas makes them available.</Empty>}</div></section>
        <section class="g-card"><div class="g-section-head"><h2>Up next</h2><button class="g-link-btn" onClick={() => setTab('coursework')}>View all <Icon name="arrow" size={13}/></button></div>{upcoming.length ? upcoming.slice(0, 4).map(task => <TaskRow key={`${task.course.id}-${task.assignment.id}`} task={task} onSelect={() => { selectCourse(task.course.id); setAssignmentId(task.assignment.id); setTab('coursework'); }}/>) : <Empty title="A little breathing room">No upcoming unsubmitted assignments with deadlines were found.</Empty>}</section>
        <section class="g-card g-plan"><div class="g-eyebrow" style={{ color: '#175b4c', marginBottom: '9px' }}>Study time</div><h2>A place for<br/>focused work.</h2><p class="g-subtitle">Turn your available study hours into a focused plan for your course.</p><button class="g-primary" style={{ marginTop: '17px', width: 'fit-content' }} onClick={() => { setTab('coursework'); }}>Plan my study time <Icon name="arrow" size={14}/></button></section></div>
        {allIssues.length > 0 && <div class="g-bottom-note"><Icon name="shield" size={13}/><span>Some sections need attention. <button class="g-link-btn" style={{ display: 'inline', fontSize: '10px' }} onClick={() => setTab('settings')}>View sync details</button></span></div>}
      </div>}
      {tab === 'coursework' && <div class="g-stack"><div><div class="g-eyebrow">Coursework</div><h1 class="g-title">The work<br/><span class="g-accent">ahead.</span></h1><p class="g-subtitle">Assignment details, grade calculations, and time to do it well.</p></div>{coursePicker}{active ? <>
        <div class="g-grade-card"><div class="g-grade-ring" style={{ '--grade': Math.min(100, Math.max(0, active.currentScore ?? 0)) }}><div><strong>{score(active.currentScore)}</strong><small>Current grade</small></div></div><div class="g-grade-info"><h2>{active.code}</h2><p>{active.input.course.applyGroupWeights ? 'Weighted assignment groups' : 'Total points grading'}<br/>{active.assignments.length} assignments in Canvas</p>{gradeMatches ? <span><Icon name="check" size={11}/>Grade model matches Canvas</span> : <span><Icon name="shield" size={11}/>Official Canvas total</span>}</div></div>
        <section><div class="g-section-head"><h2>Coursework</h2><button class="g-link-btn" onClick={() => exportCalendar(tasks.filter(t => t.course.id === active.id && pending(t.assignment) && dueDate(t.assignment) >= Date.now()), snapshot.origin)} title="Download upcoming assignment deadlines"><Icon name="download" size={13}/>Calendar</button></div><div class="g-search"><Icon name="search" size={15}/><input aria-label="Search coursework" placeholder="Find an assignment…" value={query} onInput={e => setQuery(e.currentTarget.value)}/></div><div class="g-chips" style={{ margin: '10px 0 14px' }}>{([{ value: 'todo', label: 'To do' }, { value: 'submitted', label: 'Submitted' }, { value: 'graded', label: 'Graded' }, { value: 'all', label: 'All work' }] as const).map(f => <button key={f.value} class={`g-chip ${filter === f.value ? 'active' : ''}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}</div><div class="g-card">{activeTasks.length ? activeTasks.map(task => <TaskRow key={task.assignment.id} task={task}/>) : <Empty title="Nothing in this view">Try a different filter or search to find your coursework.</Empty>}</div></section>
        {simAssignment && <section class="g-card"><div class="g-section-head"><h2>What if you scored…</h2><span class="g-label-count">SIMULATOR</span></div><label class="g-field-label" for="g-whatif-assignment">Assignment</label><select id="g-whatif-assignment" aria-label="Assignment to simulate" class="g-select" value={simAssignment.id} onChange={e => setAssignmentId(e.currentTarget.value)}>{active.assignments.filter(a => a.pointsPossible > 0).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><div class="g-title-row" style={{ marginTop: '16px' }}><span class="g-small">Hypothetical assignment score</span><strong style={{ fontSize: '24px', color: '#175b4c', letterSpacing: '-.8px' }}>{whatIf}%</strong></div><input class="g-range" aria-label="What-if score percentage" type="range" min="0" max="100" step="1" value={whatIf} onInput={e => setWhatIf(Number(e.currentTarget.value))}/><div class="g-legend"><span>0%</span><span>50%</span><span>100%</span></div><div class="g-whatif-result"><div><strong>{score(computed)}</strong><small>Model current grade</small></div><div style={{ background: '#e8f5ed' }}><strong style={{ color: '#187352' }}>{score(simulated)}</strong><small>With this assignment score</small></div></div><p class="g-small" style={{ marginTop: '10px' }}>A local calculation using visible scores and Canvas group rules. Hidden grades and extra-credit rules may differ. Nothing is saved to Canvas.</p>{plain(simAssignment.descriptionHtml) && <details style={{ marginTop: '13px' }}><summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>Assignment brief</summary><p class="g-assignment-description">{plain(simAssignment.descriptionHtml)}</p><a class="g-course-link" href={safeLink(simAssignment.htmlUrl)} style={{ marginTop: '10px' }}>Open assignment in Canvas <Icon name="arrow" size={12}/></a></details>}</section>}
        {simAssignment && <AssignmentFeedback assignment={simAssignment}/>}
        <section class="g-card g-plan"><div class="g-section-head"><div><div class="g-eyebrow" style={{ color: '#175b4c', marginBottom: '7px' }}>Time allocation</div><h2>Give the work its time.</h2></div><Icon name="bolt" size={26}/></div><p class="g-subtitle" style={{ maxWidth: '100%' }}>A suggested allocation for {active.code}, based on upcoming work and the grade model.</p><div class="g-plan-controls"><label class="g-hours"><input aria-label="Study hours available" type="number" min=".5" max="30" step=".5" value={hours} onChange={e => setHours(Math.max(.5, Math.min(30, Number(e.currentTarget.value) || .5)))}/>hours</label><button class="g-primary" onClick={buildPlan} disabled={planning}>{planning ? <><Icon name="refresh" size={14} className="g-spinner"/>Planning…</> : <>Build my study plan <Icon name="arrow" size={13}/></>}</button></div>{planError && <p class="g-notice" role="alert" style={{ marginTop: '12px' }}>{planError}</p>}{plan && <div class="g-plan-result" aria-live="polite">{plan.recommendations.length ? plan.recommendations.map(rec => <div key={rec.assignmentId} class="g-task"><div class="g-task-marker"><Icon name="clock" size={14}/></div><div class="g-task-main"><strong>{rec.assignmentName}</strong><p class="g-small">Suggested focus block</p></div><span class="g-due normal">{rec.allocatedHours.toFixed(1)} hrs</span></div>) : <p class="g-small">No eligible upcoming work to allocate. You may be all caught up.</p>}<p class="g-small" style={{ marginTop: '12px' }}>{plan.allocatedHours.toFixed(1)} of {hours} hours allocated. Effort curves are assumptions, not a promise of a score or grade.</p></div>}</section>
      </> : <Empty title="No courses to show">Active student courses will appear after a successful sync.</Empty>}</div>}
      {tab === 'resources' && <div class="g-stack"><div><div class="g-eyebrow">Course materials</div><h1 class="g-title">The course<br/><span class="g-accent">library.</span></h1><p class="g-subtitle">Your course materials and updates, one click away.</p></div>{coursePicker}{active && <><div class="g-search"><Icon name="search" size={15}/><input aria-label="Search resources" placeholder="Search your course materials…" value={resourceQuery} onInput={e => setResourceQuery(e.currentTarget.value)}/></div><div class="g-chips">{([{ id: 'all', label: 'Everything' }, { id: 'module', label: 'Modules' }, { id: 'page', label: 'Pages' }, { id: 'file', label: 'Files' }] as const).map(f => <button class={`g-chip ${resourceFilter === f.id ? 'active' : ''}`} aria-pressed={resourceFilter === f.id} onClick={() => setResourceFilter(f.id)}>{f.label}</button>)}</div><section class="g-card"><div class="g-section-head"><h2>Course library</h2><span class="g-label-count">{active.resources.length} ITEMS</span></div>{active.resources.filter(r => (resourceFilter === 'all' || r.type === resourceFilter) && r.title.toLowerCase().includes(resourceQuery.toLowerCase())).map(r => <a class="g-resource" key={`${r.type}-${r.id}`} href={safeLink(r.url)}><span class="g-resource-icon"><Icon name={r.type === 'module' ? 'layers' : r.type === 'file' ? 'file' : 'book'} size={17}/></span><span><strong>{r.title}</strong><small>{r.type}</small></span><Icon name="chevron" size={14}/></a>)}{!active.resources.filter(r => (resourceFilter === 'all' || r.type === resourceFilter) && r.title.toLowerCase().includes(resourceQuery.toLowerCase())).length && <Empty title="No matching materials">Try another search. Some materials may only be available through your course's Modules page.</Empty>}</section>
        <section class="g-card"><div class="g-section-head"><h2>Course updates</h2><Icon name="calendar" size={16}/></div>{active.announcements.length ? active.announcements.slice(0, 10).map(a => <details class="g-announcement" key={a.id}><summary>{a.title}</summary><p>{plain(a.bodyHtml)}</p>{a.postedAt && <div class="g-small" style={{ marginTop: '6px' }}>{new Date(a.postedAt).toLocaleDateString()}</div>}<a href={safeLink(a.url)}>Read in Canvas →</a></details>) : <p class="g-small">No announcements returned for this course.</p>}</section>
        {active.syllabusHtml && <section class="g-card"><div class="g-section-head"><h2>Syllabus</h2><a class="g-course-link" href={`${safeLink(active.url)}/assignments/syllabus`}>Open <Icon name="arrow" size={12}/></a></div><p class="g-syllabus">{plain(active.syllabusHtml)}</p></section>}<MaterialAccess courses={[active]} compact/>{active.issues.length > 0 && <div class="g-notice"><Icon name="shield" size={16}/><span>Some sections could not finish syncing. Available materials are listed above; see sync details in Settings.</span></div>}</>}</div>}
      {tab === 'settings' && <div class="g-stack"><div><div class="g-eyebrow">Built around you</div><h1 class="g-title">Your <span class="g-accent">workspace.</span></h1><p class="g-subtitle">A clear view of your connection and preferences.</p></div><section class="g-card"><div class="g-section-head"><h2>Connected account</h2><div class="g-user">{initials(snapshot.user.name)}</div></div><div class="g-setting-row"><span>Signed in as</span><strong>{snapshot.user.name}</strong></div><div class="g-setting-row"><span>Canvas</span><strong>{new URL(snapshot.origin).hostname}</strong></div><div class="g-setting-row"><span>Last updated</span><strong>{new Date(snapshot.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div><div class="g-setting-row"><span>Data source</span><strong>{preview ? 'Sample preview data' : 'Your signed-in Canvas session'}</strong></div><button class="g-secondary" style={{ marginTop: '14px', width: '100%' }} onClick={onRefresh} disabled={loading}><Icon name="refresh" size={14}/>Refresh now</button></section>
        <div class="g-notice success"><Icon name="shield" size={18}/><span><strong>Your account stays yours.</strong><br/>GRADIENT reads your student courses in this tab. When you ask the assistant, selected coursework goes to your local AI service. Web research sends topic searches to public search services. Canvas access stays read-only.</span></div>
        <section class="g-card g-credits"><div class="g-section-head"><h2>Course credit hours</h2><Icon name="book" size={16}/></div><p class="g-small" style={{ marginBottom: '10px' }}>Canvas doesn't provide credit hours. Set them here for planning; each course defaults to 3.</p>{courses.map(c => <label key={c.id}><span>{c.code}</span><input class="g-credit" aria-label={`Credit hours for ${c.code}`} type="number" min=".5" max="30" step=".5" value={credits[c.id] ?? 3} onChange={e => saveCredit(c.id, Number(e.currentTarget.value))}/></label>)}{creditError && <p class="g-notice" role="alert">{creditError}</p>}</section>
        <DeadlineTracker snapshot={snapshot} preview={preview}/>
        <MaterialAccess courses={courses}/>{allIssues.length > 0 && <details class="g-issue-details"><summary>Sync issues · {allIssues.length} need attention</summary><ul>{allIssues.map((issue, i) => <li key={i}><strong>{courses.find(c => c.id === issue.courseId)?.code ?? 'Canvas'} · {issue.section}:</strong> {issue.message}</li>)}</ul></details>}
        <p class="g-small">GRADIENT respects your existing Canvas permissions. Unpublished, locked, and instructor-only materials remain unavailable. Course contents stay in memory for this tab. Preferences and enabled reminder metadata are saved locally. Completed AI jobs expire from local service memory after 30 minutes.</p>
      </div>}
      </>}
      {assistantSnapshot.current && (assistantOpened || tab === 'assistant') && <div key="local-assistant" hidden={tab !== 'assistant' || !snapshot}><AssistantView key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} preview={preview} initialCourseId={selectedCourseId || initialCourseId} initialAssignmentId={initialAssignmentId}/></div>}
    </div><footer class="g-footer"><span><Icon name="shield" size={11}/>{preview ? 'Preview environment' : 'Read-only · In your Canvas tab'}</span><span>{snapshot?.user.shortName || 'Made for your next step'}<span class="g-user">{snapshot ? initials(snapshot.user.name) : 'G'}</span></span></footer>
  </aside>}</>;
}
