import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot, CanvasCourseSnapshot, CanvasLiveAssignment } from '../liveCanvas.js';
import { currentGrade } from '../../core/gradeModel.js';
import { DEFAULT_GRADE_POINT_SCALE } from '../../core/schema.js';
import { optimizeEffort, type OptimizerResult } from '../../core/optimiser.js';
import { loadOptions, saveOptions } from '../options/optionsStorage.js';
import { WORKSPACE_STYLES } from './workspaceStyles.js';
import { Icon } from './Icons.js';
import { MaterialAccess } from './MaterialAccess.js';
import { AssistantView, type AssistantFocus } from './AssistantView.js';
import { CanvasMirror } from './CanvasMirror.js';
import { DeadlineTracker } from './DeadlineTracker.js';
import { AutoWorkflow, WorkflowModeChoice, type WorkflowMode } from './WorkflowMode.js';
import { WORKFLOW_STYLES } from './workflowStyles.js';
import { ReuFinder } from './ReuFinder.js';
import { GradeLab } from './GradeLab.js';
import { PhotoCheck } from './PhotoCheck.js';
import { GradeLabStyles } from './gradeLabStyles.js';
import { StudyStudio } from './StudyStudio.js';
import { CommandCenter } from './CommandCenter.js';
import { COMMAND_STYLES } from './commandStyles.js';

export interface WorkspaceProps {
  snapshot: CanvasSnapshot | null;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  initialCourseId?: string;
  initialAssignmentId?: string;
  progress?: string;
  preview?: boolean;
  onWorkflowMode?: (mode: 'manual' | 'auto' | null) => void;
}
type Tab = 'overview' | 'assistant' | 'coursework' | 'resources' | 'settings';
type Task = { course: CanvasCourseSnapshot; assignment: CanvasLiveAssignment };
const colors = [
  { tint: '#ffe4cc', ink: '#d64500' }, { tint: '#d8f6ee', ink: '#0a7a6a' },
  { tint: '#dce8ff', ink: '#1d4ed8' }, { tint: '#fff3c2', ink: '#a15c00' },
  { tint: '#ffe8d6', ink: '#c2410c' }, { tint: '#e4f7e8', ink: '#15803d' },
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
function score(value: number | null | undefined): string { return value == null ? '--' : `${value.toFixed(1)}%`; }
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
function Empty({ title, children }: { title: string; children: string }) { return <div class="g-empty"><div class="g-empty-icon"><Icon name="check" size={24}/></div><h2>{title}</h2><p>{children}</p></div>; }
function TaskRow({ task, onSelect }: { task: Task; onSelect?: () => void }) {
  const { course, assignment: a } = task;
  return <div class="g-task"><div class="g-task-marker"><Icon name="book" size={18}/></div><div class="g-task-main"><strong>{onSelect ? <button onClick={onSelect}>{a.name}</button> : <a href={safeLink(a.htmlUrl)}>{a.name}</a>}</strong><div class="g-task-meta"><span>{course.code}</span><span>{a.pointsPossible} pts</span>{!pending(a) && <span>{taskStatus(a)}</span>}</div></div><span class={`g-due ${dueDate(a) > Date.now() + 2 * 86400000 || !a.dueAt ? 'normal' : ''}`}>{dueLabel(a)}</span></div>;
}

function AssignmentFeedback({ assignment }: { assignment: CanvasLiveAssignment }) {
  const rubric = assignment.rubric ?? [];
  const comments = assignment.submission?.submissionComments ?? [];
  const assessment = assignment.submission?.rubricAssessment ?? {};
  if (!rubric.length && !comments.length) return null;
  return <section class="g-card" aria-label="Assignment rubric and instructor feedback">
    <details>
      <summary class="g-feedback-summary">Rubric & feedback</summary>
      {rubric.length > 0 && <div class="g-rubric-list">{rubric.map(criterion => {
        const assessed = assessment[criterion.id];
        return <div class="g-rubric-criterion" key={criterion.id}>
          <div class="g-section-head"><h3>{plain(criterion.description) || 'Rubric criterion'}</h3><span class="g-label-count">{criterion.points} pts</span></div>
          {assessed && <div class="g-notice info" style={{ marginBottom: '10px' }}><Icon name="check" size={16}/><div><strong>Instructor assessment: {assessed.points} / {criterion.points} pts</strong>{assessed.comments && <p style={{ marginTop: '4px' }}>{plain(assessed.comments)}</p>}</div></div>}
          {criterion.ratings.length > 0 && <details><summary class="g-ratings-summary">Rating descriptions</summary><ul class="g-rubric-ratings">{criterion.ratings.map((rating, i) => <li key={rating.id ?? i}><span>{plain(rating.description) || 'No description provided'}</span><strong>{rating.points} pts</strong></li>)}</ul></details>}
        </div>;
      })}</div>}
      {comments.length > 0 && <div class="g-feedback-comments"><h3>Submission comments</h3>{comments.map((comment, i) => <div class="g-instructor-comment" key={i}><div class="g-comment-author"><strong>{comment.authorName || 'Canvas user'}</strong>{comment.createdAt && Number.isFinite(Date.parse(comment.createdAt)) && <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>}</div><p>{plain(comment.comment)}</p></div>)}</div>}
    </details>
  </section>;
}

/** Isolated pre-consolidation UI. Used only by the legacy regression harness. */
export function LegacyWorkspace({ snapshot, loading, error, onRefresh, initialCourseId, initialAssignmentId, progress, preview = false, onWorkflowMode }: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [extraTool,setExtraTool] = useState<'grades'|'photo'|'reu'|null>(null);
  const gradesMounted = useRef(false);
  const photoMounted = useRef(false);
  const reuMounted = useRef(false);
  if(extraTool==='reu') reuMounted.current=true;
  if(extraTool==='grades') gradesMounted.current=true;
  if(extraTool==='photo') photoMounted.current=true;
  const commandMounted = useRef(false);
  const studioMounted = useRef(false);
  if (studioOpen) studioMounted.current = true;
  if (commandOpen) commandMounted.current = true;
  useLayoutEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && commandOpen) {
        const trigger = document.getElementById('gradient-panel-host')?.shadowRoot?.querySelector<HTMLButtonElement>('.jc-launch[aria-pressed="true"]');
        event.preventDefault(); setCommandOpen(false);
        requestAnimationFrame(() => trigger?.focus());
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault(); setExtraTool(null); setStudioOpen(false); setMinimized(false); setCommandOpen(previous => studioOpen || !!extraTool || !previous);
        if (!commandOpen && !snapshot) onRefresh();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [commandOpen, studioOpen, extraTool, snapshot, onRefresh]);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  useEffect(() => { onWorkflowMode?.(workflowMode); }, [workflowMode, onWorkflowMode]);
  const [autoOpened, setAutoOpened] = useState(false);
  const chooseMode = (mode: WorkflowMode) => { setWorkflowMode(mode); if (mode === 'auto') setAutoOpened(true); };
  const [assistantOpened, setAssistantOpened] = useState(false);
  const [assistantFocus, setAssistantFocus] = useState<AssistantFocus | undefined>(undefined);
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
  const [gradeScale, setGradeScale] = useState<Record<string, number>>({ ...DEFAULT_GRADE_POINT_SCALE });
  const [creditError, setCreditError] = useState('');
  const courses = snapshot?.courses ?? [];
  const active = courses.find(c => c.id === selectedCourseId) ?? courses[0];
  useEffect(() => { if (initialCourseId) setSelectedCourseId(initialCourseId); }, [initialCourseId]);
  useEffect(() => {
    if (initialAssignmentId) { setAssignmentId(initialAssignmentId); setTab('coursework'); }
  }, [initialAssignmentId]);
  useEffect(() => { let mounted = true; loadOptions().then(o => { if (mounted) { setCredits(o.courseCreditHours); setGradeScale(o.gradePointScale); } }).catch(() => {}); return () => { mounted = false; }; }, []);
  useEffect(() => { setPlan(null); setPlanError(''); }, [snapshot, selectedCourseId, credits, gradeScale, hours]);
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
  const allIssues = [...(snapshot?.issues ?? []), ...courses.flatMap(c => c.issues)];
  const changeTab = (next: Tab) => { setTab(next); };
  const selectCourse = (id: string) => { setSelectedCourseId(id); setAssignmentId(''); setPlan(null); };
  const buildPlan = () => {
    if (!active || planning) return;
    setPlanning(true); setPlanError('');
    setTimeout(() => {
      try {
        const input = { ...active.input, studyEligibleAssignmentIds: active.assignments.filter(pending).map(assignment => assignment.id), course: { ...active.input.course, creditHours: credits[active.id] ?? 3, gradePointScale: gradeScale } };
        const result = optimizeEffort([input], { capacityHours: hours, stepSizeHours: .5, numSamples: 100, seed: 42, currentTime: new Date(), protectMastery: true, masteryFloorHours: .5, isRobustnessRun: true });
        setPlan(result);
      } catch (e) { setPlanError(e instanceof Error ? e.message : 'The study plan could not be calculated.'); }
      finally { setPlanning(false); }
    }, 30);
  };
  const saveCredit = (id: string, n: number) => {
    if (!Number.isFinite(n) || n <= 0 || n > 30) return;
    const next = { ...credits, [id]: n }; setCredits(next); setCreditError('');
    saveOptions({ courseCreditHours: next }).catch(() => setCreditError('Your credit hours could not be saved. They will apply for this session.'));
  };
  const next = upcoming[0];
  const doNext = () => {
    if (next) { selectCourse(next.course.id); setAssistantFocus({ courseId: next.course.id, assignmentId: next.assignment.id, autopilot: true, nonce: Date.now() }); }
    setTab('assistant');
  };
  const firstName = snapshot ? (snapshot.user.shortName || snapshot.user.name).split(' ')[0] : '';
  const visibleResources = active?.resources.filter(r => (resourceFilter === 'all' || r.type === resourceFilter) && r.title.toLowerCase().includes(resourceQuery.toLowerCase())) ?? [];
  const coursePicker = active ? <div class="g-course-menu"><select class="g-select" aria-label="Choose a course" value={active.id} onChange={e => selectCourse(e.currentTarget.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select><a class="g-icon-btn" href={safeLink(active.url)} title="Open course in Canvas" aria-label="Open course in Canvas"><Icon name="external" size={18}/></a></div> : null;
  const tabs = [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'assistant', label: 'Assistant', icon: 'spark' }, { id: 'coursework', label: 'Coursework', icon: 'book' }, { id: 'resources', label: 'Resources', icon: 'folder' }, { id: 'settings', label: 'Settings', icon: 'settings' }] as const;

  return <><style>{WORKSPACE_STYLES + WORKFLOW_STYLES + COMMAND_STYLES + GradeLabStyles}</style>{minimized && <button id="gradient-launcher" class="g-launcher" aria-label="Open GRADIENT" onClick={() => setMinimized(false)}><Icon name="chart" size={22}/>gradient</button>}<aside hidden={minimized} id="gradient-workspace" class={`gw ${wide ? 'wide' : ''}`} aria-label="GRADIENT Canvas workspace">
    <header class="g-header"><div class="g-brand"><div class="g-logo"><Icon name="chart" size={22}/></div><div class="g-wordmark">gradient<span>.</span></div>{preview && <span class="g-chip-status">Demo preview</span>}</div><button class="g-icon-btn g-hide-mobile" aria-label={wide ? 'Compact workspace' : 'Expand workspace'} title={wide ? 'Compact workspace' : 'Expand workspace'} onClick={() => setWide(!wide)}><Icon name="expand" size={17}/></button><button class="g-icon-btn" aria-label="Refresh Canvas data" title="Refresh Canvas data" disabled={loading} onClick={onRefresh}><Icon name="refresh" size={17} className={loading ? 'g-spinner' : ''}/></button><button class="g-icon-btn" aria-label="Minimise GRADIENT" title="Minimise GRADIENT" onClick={() => setMinimized(true)}><Icon name="collapse" size={18}/></button></header>
    <div class="g-tool-launchers"><button class="jc-launch" aria-pressed={commandOpen && !studioOpen && !extraTool} onClick={() => { setExtraTool(null); setStudioOpen(false); setCommandOpen(previous => !!extraTool || studioOpen || !previous); if (!snapshot) onRefresh(); }}><span class="tool-copy"><strong>Command center</strong><small>Voice · plan · focus</small></span><Icon name={commandOpen && !studioOpen && !extraTool ? 'close' : 'bolt'} size={17}/></button>
    <button class="jc-launch" aria-pressed={commandOpen && studioOpen && !extraTool} onClick={() => { setExtraTool(null); setStudioOpen(true); setCommandOpen(previous => !!extraTool || !studioOpen || !previous); if (!snapshot) onRefresh(); }}><span class="tool-copy"><strong>Study studio</strong><small>Sources · practice · review</small></span><Icon name="book" size={17}/></button>
    <button class="jc-launch" aria-pressed={commandOpen && extraTool==='grades'} onClick={()=>{setExtraTool('grades');setCommandOpen(previous=>extraTool!=='grades'||!previous);if(!snapshot)onRefresh();}}><span class="tool-copy"><strong>Grade lab</strong><small>GPA · grade breakdown</small></span><Icon name="chart" size={17}/></button>
    <button class="jc-launch" aria-pressed={commandOpen && extraTool==='photo'} onClick={()=>{setExtraTool('photo');setCommandOpen(previous=>extraTool!=='photo'||!previous);if(!snapshot)onRefresh();}}><span class="tool-copy"><strong>Photo check</strong><small>Read · confirm · critique</small></span><Icon name="file" size={17}/></button><button class="jc-launch" aria-pressed={commandOpen && extraTool==='reu'} onClick={()=>{setExtraTool('reu');setCommandOpen(previous=>extraTool!=='reu'||!previous);if(!snapshot)onRefresh();}}><span class="tool-copy"><strong>Research opportunities</strong><small>REUs matched to your courses</small></span><Icon name="search" size={17}/></button></div>
    <div class="jc-area" hidden={!commandOpen || extraTool==='reu'}>{loading && <p class="jc-muted" role="status">{progress || 'Refreshing Canvas…'}</p>}{error && <p class="jc-error" role="alert">{error}</p>}{commandMounted.current && assistantSnapshot.current && <div hidden={studioOpen || !!extraTool}><CommandCenter key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} active={commandOpen && !studioOpen && !extraTool && !minimized} onRefresh={onRefresh}/></div>}{studioMounted.current && assistantSnapshot.current && <div hidden={!studioOpen || !!extraTool}><StudyStudio key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} active={commandOpen && studioOpen && !extraTool && !minimized}/></div>}{gradesMounted.current && assistantSnapshot.current && <div hidden={extraTool!=='grades'}><GradeLab key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} credits={credits} gradePointScale={gradeScale}/></div>}{photoMounted.current && assistantSnapshot.current && <div hidden={extraTool!=='photo'}><PhotoCheck key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} active={commandOpen && extraTool==='photo' && !minimized}/></div>}</div>
    {reuMounted.current && assistantSnapshot.current && <div class="jc-area" hidden={!commandOpen || extraTool!=='reu'}><ReuFinder key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current}/></div>}
    {workflowMode && !commandOpen && <div class="g-modes" role="group" aria-label="Workflow mode"><button class={workflowMode === 'auto' ? 'active' : ''} aria-label="Use auto mode" aria-pressed={workflowMode === 'auto'} onClick={() => chooseMode('auto')}><Icon name="bolt" size={17}/>Auto</button><button class={workflowMode === 'manual' ? 'active' : ''} aria-label="Use manual mode" aria-pressed={workflowMode === 'manual'} onClick={() => chooseMode('manual')}><Icon name="grid" size={16}/>Manual</button></div>}
    <div class="wf-choice-area" hidden={commandOpen || workflowMode !== null}><WorkflowModeChoice onChoose={chooseMode}/></div>
    {autoOpened && <div class="wf-auto-area" hidden={commandOpen || workflowMode !== 'auto'}><AutoWorkflow/></div>}
    <div class="wf-manual-area" hidden={commandOpen || workflowMode !== 'manual'}>
    <nav class="g-nav" role="tablist" aria-label="Workspace views" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.findIndex(item => item.id === tab);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const nextTab = tabs[index]!; changeTab(nextTab.id);
      event.currentTarget.querySelector<HTMLButtonElement>(`#g-tab-${nextTab.id}`)?.focus();
    }}>{tabs.map(item => <button key={item.id} id={`g-tab-${item.id}`} class={`g-tab ${tab === item.id ? 'active' : ''}`} role="tab" tabIndex={tab === item.id ? 0 : -1} aria-selected={tab === item.id} aria-controls="gradient-tab-content" onClick={() => changeTab(item.id)}><Icon name={item.icon} size={19}/>{item.label}</button>)}</nav>
    <div id="gradient-tab-content" ref={bodyRef} class="g-body" role="tabpanel" aria-labelledby={`g-tab-${tab}`}>
      {error && <div class="g-notice" role="alert" style={{ marginBottom: '16px' }}><Icon name="alert" size={18}/><div>{error}<button class="g-link-btn" onClick={onRefresh} disabled={loading}>Try again <Icon name="arrow" size={14}/></button></div></div>}
      {!snapshot && loading ? <div class="g-stack"><div><h1 class="g-title">Syncing<br/><span class="g-accent">your Canvas.</span></h1><p class="g-subtitle">Connecting your courses, deadlines, and materials.</p></div><div class="g-sync-loading" role="status"><Icon name="refresh" size={16} className="g-spinner"/>{progress || 'Syncing your Canvas account…'}</div><div class="g-skeleton"/><div class="g-skeleton"/><div class="g-skeleton"/></div> : !snapshot ? <Empty title="Let's connect your Canvas">Sign in to Canvas, then tap refresh.</Empty> : <>
      {tab === 'overview' && <div class="g-stack">
        <h1 class="g-title">Hey {firstName}.<br/><span class="g-accent">{dueThisWeek.length ? `${dueThisWeek.length} due this week.` : 'All clear this week.'}</span></h1>
        <button class="g-hero-cta" onClick={doNext}><span class="g-hero-icon"><Icon name="bolt" size={28}/></span><span><strong>Do my next assignment</strong><small>{next ? next.assignment.name : 'Open the assistant'}</small></span><span class="g-hero-go"><Icon name="arrow" size={22}/></span></button>
        <div class="g-metrics"><div class="g-metric peach"><strong>{courses.length}</strong><small>Courses</small></div><div class="g-metric pink"><strong>{upcoming.length}</strong><small>To do</small></div><div class="g-metric mint"><strong>{submittedCount}</strong><small>Awaiting grades</small></div></div>
        <div class="g-overview-grid"><section><div class="g-section-head"><h2>Courses</h2></div><div class="g-course-list">{courses.map((course, i) => { const color = colors[i % colors.length]!; return <button key={course.id} class="g-course" style={{ '--tint': color.tint, '--ink': color.ink }} onClick={() => { selectCourse(course.id); setTab('coursework'); }}><div class="g-course-symbol">{course.code.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}</div><div class="g-course-info"><strong>{course.name}</strong><small>{course.assignments.filter(pending).length} to do</small></div><div class="g-course-score">{score(course.currentScore)}</div></button>; })}{!courses.length && <Empty title="No courses yet">Your active courses will show up here.</Empty>}</div></section>
        <section class="g-card"><div class="g-section-head"><h2>Up next</h2><button class="g-link-btn" onClick={() => setTab('coursework')}>All <Icon name="arrow" size={15}/></button></div>{upcoming.length ? upcoming.slice(0, 4).map(task => <TaskRow key={`${task.course.id}-${task.assignment.id}`} task={task} onSelect={() => { selectCourse(task.course.id); setAssignmentId(task.assignment.id); setTab('coursework'); }}/>) : <Empty title="Nothing due">Enjoy the breathing room.</Empty>}</section></div>
      </div>}
      {tab === 'coursework' && <div class="g-stack">{coursePicker}{active ? <>
        <div class="g-grade-card"><div class="g-grade-ring" style={{ '--grade': Math.min(100, Math.max(0, active.currentScore ?? 0)) }}><div><strong>{score(active.currentScore)}</strong><small>Grade</small></div></div><div class="g-grade-info"><h2>{active.code}</h2><p>{active.assignments.filter(pending).length} to do · {active.assignments.length} total</p></div></div>
        <section><div class="g-section-head"><h2>Assignments</h2><button class="g-icon-btn" onClick={() => exportCalendar(tasks.filter(t => t.course.id === active.id && pending(t.assignment) && dueDate(t.assignment) >= Date.now()), snapshot.origin)} aria-label="Download upcoming deadlines" title="Download upcoming deadlines"><Icon name="calendar" size={18}/></button></div><div class="g-search"><Icon name="search" size={18}/><input aria-label="Search coursework" placeholder="Find an assignment" value={query} onInput={e => setQuery(e.currentTarget.value)}/></div><div class="g-chips" style={{ margin: '12px 0 14px' }}>{([{ value: 'todo', label: 'To do' }, { value: 'submitted', label: 'Submitted' }, { value: 'graded', label: 'Graded' }, { value: 'all', label: 'All work' }] as const).map(f => <button key={f.value} class={`g-chip ${filter === f.value ? 'active' : ''}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}</div><div class="g-card">{activeTasks.length ? activeTasks.map(task => <TaskRow key={task.assignment.id} task={task}/>) : <Empty title="Nothing here">Try another filter.</Empty>}</div></section>
        {simAssignment && <section class="g-card"><div class="g-section-head"><h2>What if I score…</h2><span class="g-big-number">{whatIf}%</span></div><select id="g-whatif-assignment" aria-label="Assignment to simulate" class="g-select" value={simAssignment.id} onChange={e => setAssignmentId(e.currentTarget.value)}>{active.assignments.filter(a => a.pointsPossible > 0).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><input class="g-range" aria-label="What-if score percentage" type="range" min="0" max="100" step="1" value={whatIf} onInput={e => setWhatIf(Number(e.currentTarget.value))}/><div class="g-whatif-result"><div><strong>{score(computed)}</strong><small>Now</small></div><div class="hot"><strong>{score(simulated)}</strong><small>With that score</small></div></div></section>}
        {simAssignment && <AssignmentFeedback assignment={simAssignment}/>}
        <section class="g-card soft"><div class="g-section-head"><h2>Study plan</h2><Icon name="clock" size={22}/></div><div class="g-plan-controls"><label class="g-hours"><input aria-label="Study hours available" type="number" min=".5" max="30" step=".5" value={hours} onChange={e => setHours(Math.max(.5, Math.min(30, Number(e.currentTarget.value) || .5)))}/>hours</label><button class="g-primary" onClick={buildPlan} disabled={planning}>{planning ? <><Icon name="refresh" size={17} className="g-spinner"/>Planning…</> : <>Build my study plan <Icon name="arrow" size={17}/></>}</button></div>{planError && <p class="g-notice" role="alert" style={{ marginTop: '12px' }}>{planError}</p>}{plan && <div class="g-plan-result" aria-live="polite">{plan.recommendations.length ? plan.recommendations.map(rec => <div key={rec.assignmentId} class="g-task"><div class="g-task-marker"><Icon name="clock" size={17}/></div><div class="g-task-main"><strong>{rec.assignmentName}</strong></div><span class="g-due normal">{rec.allocatedHours.toFixed(1)} hrs</span></div>) : <p class="g-small">You're all caught up.</p>}<p class="g-small" style={{ marginTop: '12px' }}>{plan.allocatedHours.toFixed(1)} of {hours} hours allocated.</p></div>}</section>
      </> : <Empty title="No courses to show">Courses appear after a sync.</Empty>}</div>}
      {tab === 'resources' && <div class="g-stack">{coursePicker}{active && <><div class="g-search"><Icon name="search" size={18}/><input aria-label="Search resources" placeholder="Search materials" value={resourceQuery} onInput={e => setResourceQuery(e.currentTarget.value)}/></div><div class="g-chips">{([{ id: 'all', label: 'Everything' }, { id: 'module', label: 'Modules' }, { id: 'page', label: 'Pages' }, { id: 'file', label: 'Files' }] as const).map(f => <button key={f.id} class={`g-chip ${resourceFilter === f.id ? 'active' : ''}`} aria-pressed={resourceFilter === f.id} onClick={() => setResourceFilter(f.id)}>{f.label}</button>)}</div><section class="g-card"><div class="g-section-head"><h2>Library</h2><span class="g-label-count">{active.resources.length}</span></div>{visibleResources.map(r => <a class="g-resource" key={`${r.type}-${r.id}`} href={safeLink(r.url)}><span class="g-resource-icon"><Icon name={r.type === 'module' ? 'layers' : r.type === 'file' ? 'file' : 'book'} size={19}/></span><span><strong>{r.title}</strong><small>{r.type}</small></span><Icon name="chevron" size={16}/></a>)}{!visibleResources.length && <Empty title="No matches">Try another search.</Empty>}</section>
        <section class="g-card"><div class="g-section-head"><h2>Updates</h2><Icon name="calendar" size={20}/></div>{active.announcements.length ? active.announcements.slice(0, 10).map(a => <details class="g-announcement" key={a.id}><summary>{a.title}</summary><p>{plain(a.bodyHtml)}</p>{a.postedAt && <div class="g-small" style={{ marginTop: '6px' }}>{new Date(a.postedAt).toLocaleDateString()}</div>}<a href={safeLink(a.url)}>Read in Canvas <Icon name="arrow" size={13}/></a></details>) : <p class="g-small">No announcements yet.</p>}</section>
        {active.syllabusHtml && <section class="g-card"><div class="g-section-head"><h2>Syllabus</h2><a class="g-course-link" href={`${safeLink(active.url)}/assignments/syllabus`}>Open <Icon name="arrow" size={14}/></a></div><p class="g-syllabus">{plain(active.syllabusHtml)}</p></section>}<MaterialAccess courses={[active]} compact/>{active.issues.length > 0 && <div class="g-notice"><Icon name="alert" size={18}/><span>Some sections didn't sync. Details are in Settings.</span></div>}</>}</div>}
      {tab === 'settings' && <div class="g-stack"><section class="g-card"><div class="g-section-head"><h2>{snapshot.user.name}</h2><div class="g-user">{initials(snapshot.user.name)}</div></div><div class="g-setting-row"><span>Canvas</span><strong>{new URL(snapshot.origin).hostname}</strong></div><div class="g-setting-row"><span>Last synced</span><strong>{new Date(snapshot.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div><button class="g-secondary" style={{ marginTop: '14px', width: '100%' }} onClick={onRefresh} disabled={loading}><Icon name="refresh" size={17}/>Refresh now</button></section>
        <section class="g-card g-credits"><div class="g-section-head"><h2>Credit hours</h2><Icon name="book" size={20}/></div>{courses.map(c => <label key={c.id}><span>{c.code}</span><input class="g-credit" aria-label={`Credit hours for ${c.code}`} type="number" min=".5" max="30" step=".5" value={credits[c.id] ?? 3} onChange={e => saveCredit(c.id, Number(e.currentTarget.value))}/></label>)}{creditError && <p class="g-notice" role="alert">{creditError}</p>}</section>
        <DeadlineTracker snapshot={snapshot} preview={preview}/><CanvasMirror snapshot={snapshot}/>
        <MaterialAccess courses={courses}/>{allIssues.length > 0 && <details class="g-issue-details"><summary>Sync issues · {allIssues.length}</summary><ul>{allIssues.map((issue, i) => <li key={i}><strong>{courses.find(c => c.id === issue.courseId)?.code ?? 'Canvas'} · {issue.section}:</strong> {issue.message}</li>)}</ul></details>}
      </div>}
      </>}
      {assistantSnapshot.current && (assistantOpened || tab === 'assistant') && <div key="local-assistant" hidden={tab !== 'assistant' || !snapshot}><AssistantView key={`${assistantSnapshot.current.origin}|${assistantSnapshot.current.user.id}`} snapshot={assistantSnapshot.current} preview={preview} initialCourseId={selectedCourseId || initialCourseId} initialAssignmentId={initialAssignmentId} focus={assistantFocus}/></div>}
    </div></div>
  </aside></>;
}
