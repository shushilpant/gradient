import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { currentGrade } from '../../core/gradeModel.js';
import { DEFAULT_GRADE_POINT_SCALE } from '../../core/schema.js';
import { loadAcademicPreferences } from '../academicPreferences.js';
import { getAcademicContext } from '../academicContext.js';
import { getAssignmentPriorities } from '../assignmentPriorities.js';
import { assignmentWhatIfGrade, canTargetAssignmentGrade } from '../assignmentGradeTarget.js';
import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import { courseBriefing, dueTime, isGraded, isPending, isSubmitted, LOCALE } from '../plainLanguage.js';
import { allocateStudySplit, type StudySplitItem } from '../studySplit.js';
import { ChangeRadar } from './ChangeRadar.js';
import { AiRules } from './AiRules.js';
import { WORKSPACE_STYLES } from './workspaceStyles.js';
import { Icon } from './Icons.js';
import { AssistantView, type AssistantFocus } from './AssistantView.js';
import { CanvasMirror } from './CanvasMirror.js';
import { DeadlineTracker } from './DeadlineTracker.js';
import { canAutomateCurrentPage, getPageAutomation, subscribePageAutomation } from '../pageAutomation.js';
import { startPageDemo } from '../pageDemo.js';
import { AutoWorkflow, type WorkflowTarget } from './WorkflowMode.js';
import { WORKFLOW_STYLES } from './workflowStyles.js';
import { ReuFinder } from './ReuFinder.js';
import { AcademicsDemo, AssistantDemo, AutomationDemo, ResearchDemo } from './PresentationDemos.js';
import { PanicAutomationDemo } from './PanicAutomationDemo.js';
import { GradeLab } from './GradeLab.js';
import { GradeLabStyles } from './gradeLabStyles.js';
import { COMMAND_STYLES } from './commandStyles.js';
import { CourseList, GradeHero, PlainExplainer, StandingChart, TaskRow, WorkloadChart, WorkStatus, type Task } from './Dashboard.js';
import { AssignmentPriorities } from './AssignmentPriorities.js';
import { AssignmentGradeTarget } from './AssignmentGradeTarget.js';
import { AssignmentFeedback } from './AssignmentFeedback.js';
import { StudyBlockCalendar } from './StudyBlockCalendar.js';

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
type Tab = 'academics' | 'assistant' | 'automation' | 'research';
type AcademicView = 'overview' | 'coursework' | 'grades';
const TOUR: Tab[] = ['academics', 'assistant', 'automation', 'research'];
const TOUR_HOLD_MS = 4500;
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
function score(value: number | null | undefined): string { return value == null ? '–' : `${value.toFixed(1)}%`; }
const pending = isPending;
const dueDate = dueTime;
function exportCalendar(tasks: Task[], origin: string): void {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OffCanvas//Canvas Coursework//EN', 'CALSCALE:GREGORIAN'];
  for (const { course, assignment: a } of tasks.filter(t => t.assignment.dueAt)) {
    const start = new Date(a.dueAt!);
    if (!Number.isFinite(start.getTime())) continue;
    lines.push('BEGIN:VEVENT', `UID:offcanvas-${course.id}-${a.id}@${new URL(origin).hostname}`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 15 * 60000))}`, `SUMMARY:${esc(a.name)}`, `DESCRIPTION:${esc(course.name + '\nAssignment deadline from Canvas.\n' + a.htmlUrl)}`, `URL:${safeLink(a.htmlUrl)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 physical lines must be folded at 75 UTF-8 octets.
  const folded = lines.map(line => { let result = '', count = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (count + bytes > 74) { result += '\r\n '; count = 1; } result += char; count += bytes; } return result; }).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([folded], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'offcanvas-canvas-deadlines.ics'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Empty({ title, children }: { title: string; children: string }) { return <div class="g-empty"><div class="g-empty-icon"><Icon name="check" size={20}/></div><h2>{title}</h2><p>{children}</p></div>; }

export function Workspace({ snapshot, loading, error, onRefresh, initialCourseId, initialAssignmentId, progress, preview = false, onWorkflowMode }: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>(() => !preview&&getPageAutomation()?'automation':'academics');
  const [demoTab,setDemoTab] = useState<Tab | null>(null);
  const presentationDemo = demoTab===tab;
  const [demoVersion,setDemoVersion] = useState(0);
  const [tour,setTour] = useState<Tab[] | null>(null);
  const [tourStep,setTourStep] = useState(0);
  const [presentOpen, setPresentOpen] = useState(false);
  const tourRef = useRef<{ order: Tab[] | null; step: number }>({ order: null, step: 0 });
  tourRef.current = { order: tour, step: tourStep };
  const tourTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startDemo = (next: Tab) => { setMinimized(false); setPresentOpen(false); setTab(next); setDemoTab(next); setDemoVersion(version=>version+1); };
  const stopTour = () => { clearTimeout(tourTimer.current); setTour(null); };
  const startTour = (hasSnapshot: boolean) => {
    const order = TOUR.filter(item => hasSnapshot || (item !== 'academics' && item !== 'research'));
    clearTimeout(tourTimer.current); setTour(order); setTourStep(0); startDemo(order[0]!);
  };
  const demoDone = () => {
    const { order, step } = tourRef.current;
    if (!order) return;
    clearTimeout(tourTimer.current);
    tourTimer.current = setTimeout(() => {
      if (step >= order.length - 1) { setTour(null); return; }
      setTourStep(step + 1); startDemo(order[step + 1]!);
    }, TOUR_HOLD_MS);
  };
  useEffect(() => () => clearTimeout(tourTimer.current), []);
  const leaveDemo = () => { stopTour(); setDemoTab(null); };
  const [pageRun,setPageRun] = useState(getPageAutomation);
  useEffect(() => preview ? undefined : subscribePageAutomation(setPageRun), [preview]);
  const showingPageRun = !preview && tab==='automation' && !!pageRun;
  const [academicView, setAcademicView] = useState<AcademicView>(initialAssignmentId ? 'coursework' : 'overview');
  const [panic, setPanic] = useState(false);
  const [overviewTime, setOverviewTime] = useState(Date.now);
  useEffect(() => {
    if (tab !== 'academics' || academicView !== 'overview' || !snapshot) return;
    setOverviewTime(Date.now());
    const timer = window.setInterval(() => setOverviewTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [tab, academicView, snapshot]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const priorityFocus = useRef<string | null>(null);
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab, academicView]);
  const [assistantOpened, setAssistantOpened] = useState(false);
  const [automationOpened, setAutomationOpened] = useState(false);
  const [researchOpened, setResearchOpened] = useState(false);
  const [assistantFocus, setAssistantFocus] = useState<AssistantFocus | undefined>(undefined);
  const [panicTarget, setPanicTarget] = useState<(WorkflowTarget & { accountScope: string })>();
  useEffect(() => { if (tab === 'assistant') setAssistantOpened(true); if (tab === 'automation') setAutomationOpened(true); if (tab === 'research') setResearchOpened(true); }, [tab]);
  useEffect(() => { onWorkflowMode?.(tab === 'automation' ? 'auto' : 'manual'); }, [tab, onWorkflowMode]);
  const accountScope = snapshot ? `${snapshot.origin}|${snapshot.user.id}` : '';
  const context = useMemo(() => snapshot ? getAcademicContext(snapshot) : null, [snapshot]);
  const planEpoch = useRef(0);
  const gradesOpened = useRef(false); if (academicView === 'grades') gradesOpened.current = true;
  const [minimized, setMinimized] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const toggle = () => setMinimized(previous => !previous);
    const showAutomation = () => { setMinimized(false); setTab('automation'); };
    window.addEventListener('offcanvas:toggle', toggle);
    window.addEventListener('offcanvas:show-automation', showAutomation);
    return () => { window.removeEventListener('offcanvas:toggle', toggle); window.removeEventListener('offcanvas:show-automation', showAutomation); };
  }, []);
  useEffect(() => {
    const demo = (event: Event) => { const next = (event as CustomEvent<Tab>).detail; if (TOUR.includes(next) && (snapshot || next !== 'research')) { stopTour(); startDemo(next); } };
    const playTour = () => startTour(!!snapshot);
    window.addEventListener('offcanvas:demo', demo);
    window.addEventListener('offcanvas:tour', playTour);
    return () => { window.removeEventListener('offcanvas:demo', demo); window.removeEventListener('offcanvas:tour', playTour); };
  }, [snapshot]);
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'todo' | 'submitted' | 'graded'>('todo');
  const [assignmentId, setAssignmentId] = useState('');
  useLayoutEffect(() => {
    if (tab !== 'academics' || !priorityFocus.current) return;
    const target = bodyRef.current?.querySelector<HTMLElement>(priorityFocus.current);
    if (!target) return;
    priorityFocus.current = null;
    target.focus();
  }, [tab, academicView, assignmentId, panic]);
  const [whatIf, setWhatIf] = useState(85);
  const [hours, setHours] = useState(8);
  const [planningScope, setPlanningScope] = useState<'course' | 'all'>('all');
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<StudySplitItem[] | null>(null);
  const [planError, setPlanError] = useState('');
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [gradeScale, setGradeScale] = useState<Record<string, number>>({ ...DEFAULT_GRADE_POINT_SCALE });
  const [creditError, setCreditError] = useState('');
  const courses = snapshot?.courses ?? [];
  const active = courses.find(c => c.id === selectedCourseId) ?? courses[0];
  useEffect(() => { if (initialCourseId) setSelectedCourseId(initialCourseId); }, [initialCourseId]);
  useEffect(() => {
    if (initialAssignmentId) { setAssignmentId(initialAssignmentId); if(!getPageAutomation())setTab('academics'); setAcademicView('coursework'); }
  }, [initialAssignmentId]);
  useEffect(() => {
    let mounted = true;
    setCredits({}); setGradeScale({ ...DEFAULT_GRADE_POINT_SCALE }); setCreditError('');
    setPlan(null); setPlanError(''); setPlanning(false); setAssistantFocus(undefined); setPanicTarget(undefined);
    setQuery(''); setFilter('todo'); setWhatIf(85); setHours(8); setPanic(false);
    setSelectedCourseId(initialCourseId ?? ''); setAssignmentId(initialAssignmentId ?? '');
    if (snapshot) loadAcademicPreferences(snapshot).then(o => { if (mounted) { setCredits(o.courseCreditHours); setGradeScale(o.gradePointScale); if (context) context.preferences.courseCreditHours = o.courseCreditHours; } }).catch(() => { if (mounted) setCreditError('Saved grade settings could not be loaded. Grade calculations use defaults.'); });
    return () => { mounted = false; planEpoch.current++; };
  }, [accountScope]);
  useEffect(() => { planEpoch.current++; setPlanning(false); setPlan(null); setPlanError(''); }, [snapshot, selectedCourseId, credits, hours, planningScope]);
  useEffect(() => { if (context) Object.assign(context.preferences, { courseCreditHours: credits, weeklyStudyHours: hours, gradePointScale: gradeScale }); }, [context, credits, hours, gradeScale]);
  const tasks = useMemo(() => courses.flatMap(course => course.assignments.map(assignment => ({ course, assignment }))).sort((a, b) => dueDate(a.assignment) - dueDate(b.assignment)), [snapshot]);
  const priorities = useMemo(() => getAssignmentPriorities(snapshot?.courses ?? []), [snapshot]);
  const upcoming = priorities.filter(task => task.deadline > overviewTime);
  const studyCourses = useMemo(() => (snapshot?.courses ?? []).map(course => ({
    ...course,
    input: { ...course.input, course: { ...course.input.course, creditHours: credits[course.id] ?? 3 } },
  })), [snapshot, credits]);
  const now = Date.now();
  const activePriorities = new Map(priorities.filter(task => task.course.id === active?.id).map((task, rank) =>
    [task.assignment.id, { gradeImpact: task.gradeImpact, rank: task.deadline > now ? rank : priorities.length }]));
  const activeTasks = tasks.filter(t => t.course.id === active?.id && t.assignment.name.toLowerCase().includes(query.toLowerCase())).filter(t => filter === 'all' || (filter === 'todo' && pending(t.assignment)) || (filter === 'submitted' && isSubmitted(t.assignment)) || (filter === 'graded' && isGraded(t.assignment)));
  if (filter === 'todo') {
    const rank = (task: Task) => activePriorities.get(task.assignment.id)?.rank ?? priorities.length;
    activeTasks.sort((a, b) => rank(a) - rank(b));
  }
  const simAssignment = active?.assignments.find(a => a.id === assignmentId) ?? active?.assignments.find(a => pending(a) && a.pointsPossible > 0) ?? active?.assignments.find(a => a.pointsPossible > 0);
  const simulated = useMemo(() => active && simAssignment ? assignmentWhatIfGrade(active, simAssignment, whatIf) : null, [active, simAssignment, whatIf]);
  const computed = useMemo(() => active ? currentGrade(active.input).percentage : null, [active]);
  const activeBriefing = useMemo(() => active ? courseBriefing(active) : null, [active]);
  const firstBlock = plan?.[0];
  const allocatedHours = plan?.reduce((sum, item) => sum + item.hours, 0) ?? 0;
  const unallocatedHours = Math.max(0, hours - allocatedHours);
  const allIssues = [...(snapshot?.issues ?? []), ...courses.flatMap(c => c.issues)];
  const changeTab = (next: Tab) => { if (tourRef.current.order) stopTour(); setTab(next); };
  const openAcademic = (view: AcademicView) => { setTab('academics'); setAcademicView(view); };
  const explainAssignment = (courseId: string, assignmentId: string, autopilot = false) => { setAssistantFocus({ courseId, assignmentId, autopilot, nonce: Date.now() }); setTab('assistant'); };
  const selectCourse = (id: string) => { setSelectedCourseId(id); setAssignmentId(''); setPlan(null); };
  const openCourse = (id: string) => { selectCourse(id); openAcademic('coursework'); };
  const openPriority = (task: Task) => {
    priorityFocus.current = '#offcanvas-priority-assignment';
    selectCourse(task.course.id);
    setAssignmentId(task.assignment.id);
    openAcademic('coursework');
  };
  const openPanic = () => {
    priorityFocus.current = '#offcanvas-panic-toggle';
    setPanic(true);
    openAcademic('overview');
  };
  const automatePriority = (task: Task) => {
    if (!snapshot || preview || homeworkAutopilotBlock(task.assignment) || getPageAutomation()?.status === 'running') return;
    setPanicTarget({ courseId: task.course.id, assignmentId: task.assignment.id, accountScope });
    changeTab('automation');
  };
  const replayPanicDemo = () => {
    if (preview || !canAutomateCurrentPage()) throw new Error('Open the signed-in local Canvas replica on port 8080 to run the Panic demo.');
    if (!snapshot) throw new Error('Refresh Canvas to load CE 240 before starting the Panic demo.');
    startPageDemo(snapshot, { demoKind: 'panic' });
    leaveDemo();
    setTab('automation');
  };
  const buildPlan = () => {
    if (!active || planning) return;
    const epoch = ++planEpoch.current;
    setPlanning(true); setPlanError('');
    setTimeout(() => {
      if (epoch !== planEpoch.current) return;
      try {
        const selected = planningScope === 'all' ? studyCourses : studyCourses.filter(course => course.id === active.id);
        setPlan(allocateStudySplit(selected, hours));
      } catch (e) { setPlanError(e instanceof Error ? e.message : 'The study plan could not be calculated.'); }
      finally { setPlanning(false); }
    }, 30);
  };
  const activeDemoLabel = ({academics:'Academics',assistant:'AI Workspace',automation:'Automation',research:'Research'} as const)[tab];
  const coursePicker = active ? <div class="g-course-menu"><select class="g-select" aria-label="Choose a course" value={active.id} onChange={e => selectCourse(e.currentTarget.value)}>{courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select><a class="g-icon-btn bordered" href={safeLink(active.url)} title="Open course in Canvas" aria-label="Open course in Canvas"><Icon name="external" size={16}/></a></div> : null;
  const tabs = [{ id: 'academics', label: 'Academics', icon: 'book' }, { id: 'assistant', label: 'AI Workspace', icon: 'spark' }, { id: 'automation', label: 'Automation', icon: 'bolt' }, { id: 'research', label: 'Research', icon: 'search' }] as const;
  const demoBlocked = pageRun?.status==='running'||(!snapshot&&tab==='research');
  const syncedAt = snapshot ? new Date(snapshot.syncedAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '';
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!presentOpen) return;
    const close = (event: Event) => { if (!(event.composedPath() as Element[]).some(el => el instanceof Element && el.classList?.contains('g-present'))) setPresentOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPresentOpen(false); };
    const root = panelRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    root?.addEventListener('pointerdown', close); root?.addEventListener('keydown', escape as EventListener);
    return () => { root?.removeEventListener('pointerdown', close); root?.removeEventListener('keydown', escape as EventListener); };
  }, [presentOpen]);

  return <><style>{WORKSPACE_STYLES + WORKFLOW_STYLES + COMMAND_STYLES + GradeLabStyles}</style>{minimized && <button id="offcanvas-launcher" class="g-launcher" aria-label="Open OffCanvas" onClick={() => setMinimized(false)}><span class="g-logo" aria-hidden="true"><Icon name="chart" size={15}/></span>OffCanvas</button>}<aside ref={panelRef} hidden={minimized} id="offcanvas-workspace" class={`gw consolidated ${wide ? 'wide' : ''}`} aria-label="OffCanvas Canvas workspace">
    <header class="g-header">
      <div class="g-brand"><div class="g-logo" aria-hidden="true"><Icon name="chart" size={16}/></div><div class="g-wordmark">OffCanvas</div></div>
      <div class="g-present">
        <button class={`g-present-btn${presentOpen ? ' open' : ''}`} aria-haspopup="true" aria-expanded={presentOpen} onClick={() => setPresentOpen(!presentOpen)}><Icon name="spark" size={14}/>Present</button>
        {presentOpen && <div class="g-present-menu" role="group" aria-label="Presentation demo controls">
          <p class="g-present-title">Guided demos</p>
          <button class="g-menu-item g-demo-btn" disabled={demoBlocked} onClick={()=>{stopTour();startDemo(tab);}} aria-label={`Demo ${activeDemoLabel}`}><Icon name="bolt" size={15}/><span><strong>Demo {activeDemoLabel}</strong><small>{tab==='automation'?'Runs in the main local Canvas window':'Replays this tab with sample data'}</small></span></button>
          <button class="g-menu-item g-tour-btn" disabled={pageRun?.status==='running'} onClick={() => startTour(!!snapshot)} aria-label="Play full tour"><Icon name="spark" size={15}/><span><strong>Play full tour</strong><small>All four tabs, one after another</small></span></button>
          <p class="g-present-note">Automation navigates your local Canvas replica. Other demos use sample data. Your work is never submitted.</p>
        </div>}
      </div>
      <button class="g-icon-btn g-hide-mobile" aria-label={wide ? 'Compact workspace' : 'Expand workspace'} title={wide ? 'Compact workspace' : 'Expand workspace'} onClick={() => setWide(!wide)}><Icon name="expand" size={16}/></button>
      <button class="g-icon-btn" aria-label="Refresh Canvas data" title="Refresh Canvas data" disabled={loading} onClick={onRefresh}><Icon name="refresh" size={16} className={loading ? 'g-spinner' : ''}/></button>
      <button class="g-icon-btn" aria-label="Minimise OffCanvas" title="Minimise OffCanvas" onClick={() => setMinimized(true)}><Icon name="collapse" size={16}/></button>
    </header>
    <nav class="g-nav" role="tablist" aria-label="Workspace views" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.findIndex(item => item.id === tab);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const nextTab = tabs[index]!; changeTab(nextTab.id);
      event.currentTarget.querySelector<HTMLButtonElement>(`#g-tab-${nextTab.id}`)?.focus();
    }}>{tabs.map(item => <button key={item.id} id={`g-tab-${item.id}`} class={`g-tab ${tab === item.id ? 'active' : ''}`} role="tab" tabIndex={tab === item.id ? 0 : -1} aria-selected={tab === item.id} aria-controls="offcanvas-tab-content" onClick={() => changeTab(item.id)}><Icon name={item.icon} size={15}/>{item.label}</button>)}</nav>
    {(presentationDemo || tour) && <div class="g-demo-banner" aria-label="Presentation demo status">
      <span class="g-demo-label">Presentation · sample data</span>
      {tour && <span class="g-tour-chip" role="status"><span class="g-tour-dots" aria-hidden="true">{tour.map((item, i) => <i key={item} class={i < tourStep ? 'done' : i === tourStep ? 'on' : ''}/>)}</span>Tour · {tourStep + 1} of {tour.length}</span>}
      {tour ? <button class="g-link-btn" onClick={leaveDemo}>Stop tour</button> : <button class="g-link-btn" onClick={leaveDemo}>Back to my workspace</button>}
    </div>}
    {presentationDemo&&<div key={`${tab}:${demoVersion}`} class="g-body g-stack" role="tabpanel" aria-labelledby={`g-tab-${tab}`} aria-label={`${activeDemoLabel} saved demo`}>
      {tab==='academics'&&(snapshot
        ? <AcademicsDemo snapshot={snapshot} studyCourses={studyCourses} onDone={demoDone} onReplay={replayPanicDemo} onRestart={() => clearTimeout(tourTimer.current)}/>
        : <PanicAutomationDemo/>)}
      {tab==='assistant'&&<AssistantDemo onDone={demoDone} onRestart={()=>clearTimeout(tourTimer.current)}/>}
      {tab==='automation'&&<AutomationDemo snapshot={snapshot??undefined} onReplay={leaveDemo} onDone={demoDone}/>}
      {tab==='research'&&snapshot&&<ResearchDemo snapshot={snapshot} onDone={demoDone}/>}
    </div>}
    {!presentationDemo&&<div id="offcanvas-tab-content" ref={bodyRef} class="g-body" role="tabpanel" aria-labelledby={`g-tab-${tab}`}>
      {error && <div class="g-notice" role="alert"><Icon name="alert" size={16}/><div>{error}<button class="g-link-btn" onClick={onRefresh} disabled={loading}>Try again <Icon name="arrow" size={14}/></button></div></div>}
      {!snapshot && showingPageRun ? null : !snapshot && loading ? <div class="g-stack"><div><span class="g-eyebrow">One moment</span><h1 class="g-title">Syncing your Canvas</h1><p class="g-subtitle">Connecting your courses, deadlines, and materials.</p></div><div class="g-sync-loading" role="status"><Icon name="refresh" size={15} className="g-spinner"/>{progress || 'Syncing your Canvas account…'}</div><div class="g-skeleton"/><div class="g-skeleton short"/><div class="g-skeleton"/></div> : !snapshot ? <Empty title="Let’s connect your Canvas">Sign in to Canvas in this tab, then press refresh at the top.</Empty> : <>
      {tab === 'academics' && <div class="g-subnav" role="group" aria-label="Academic views">{([{id:'overview',label:'Overview'},{id:'coursework',label:'Coursework'},{id:'grades',label:'Grade Lab'}] as const).map(view => <button key={view.id} class={academicView === view.id ? 'active' : ''} aria-pressed={academicView === view.id} onClick={() => openAcademic(view.id)}>{view.label}</button>)}</div>}
      {tab === 'academics' && academicView === 'overview' && <div class="g-stack g-overview">
        <div class="g-dash">
          <div class="g-dash-col">
            <AssignmentPriorities key={accountScope} snapshot={snapshot} upcoming={upcoming} hasOverdue={priorities.length > upcoming.length}
              studyCourses={studyCourses} now={overviewTime} panic={panic} onPanicToggle={() => setPanic(!panic)}
              onOpen={openPriority} onPrepare={task => { selectCourse(task.course.id); explainAssignment(task.course.id, task.assignment.id, true); }}
              onAutomate={preview ? undefined : automatePriority} onDemoReplay={replayPanicDemo}/>
            <WorkloadChart snapshot={snapshot} tasks={tasks}/>
            <CourseList snapshot={snapshot} onOpen={openCourse}/>
          </div>
          <div class="g-dash-col">
            <StandingChart snapshot={snapshot} onOpen={openCourse}/>
            <WorkStatus tasks={tasks}/>
            <ChangeRadar key={accountScope} snapshot={snapshot} onPlan={openCourse}/>
            <AiRules courses={courses}/>
          </div>
        </div>
        <nav class="g-tools" aria-label="Planning tools">
          <button onClick={() => openAcademic('grades')}><Icon name="chart" size={16}/><span><strong>Grade Lab</strong><small>See how study time could move your marks</small></span><Icon name="chevron" size={14}/></button>
          <button onClick={() => openAcademic('coursework')}><Icon name="clock" size={16}/><span><strong>Plan study time</strong><small>Share out your free hours fairly</small></span><Icon name="chevron" size={14}/></button>
        </nav>
        {allIssues.length > 0 && <details class="g-issue-details g-disclosure"><summary>Sync issues · {allIssues.length}</summary><ul>{allIssues.map((issue, i) => <li key={i}><strong>{courses.find(c => c.id === issue.courseId)?.code ?? 'Canvas'} · {issue.section}:</strong> {issue.message}</li>)}</ul></details>}
      </div>}
      {tab === 'academics' && academicView === 'coursework' && <div class="g-stack">{coursePicker}{active ? <>
        <section class="g-card g-grade-card" aria-label={`${active.code} grade summary`}>
          <GradeHero snapshot={snapshot} course={active}/>
          {activeBriefing && <div class="g-grade-explain"><p class="g-small">{activeBriefing.body}</p><PlainExplainer topic="course" briefing={activeBriefing} label="Explain my grade in plain English"/></div>}
        </section>
        {simAssignment && <section class="g-card g-whatif" aria-label="What-if calculator">
          <div class="g-section-head"><h2>Assignment grade</h2></div>
          <select id="g-whatif-assignment" aria-label="Assignment to simulate" class="g-select" value={simAssignment.id} onChange={e => setAssignmentId(e.currentTarget.value)}>
            {active.assignments.filter(a => a.pointsPossible > 0 || a.id === simAssignment.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <AssignmentGradeTarget key={JSON.stringify([accountScope, active.id])} course={active} assignment={simAssignment}/>
          <label class="g-field-label">
            What if I score {whatIf}%?
            <input class="g-range" aria-label="What-if score percentage" type="range" min="0" max="100" step="1"
              value={whatIf} style={{ '--fill': `${whatIf}%` }} onInput={e => setWhatIf(Number(e.currentTarget.value))}/>
          </label>
          <div class="g-whatif-result">
            <div><small>Your mark now</small><strong>{score(computed)}</strong><span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, computed ?? 0))}%` }}/></span></div>
            <div class={`hot ${simulated != null && computed != null ? (simulated >= computed ? 'up' : 'down') : ''}`}>
              <small>With that score</small>
              <strong>{score(simulated)}{simulated != null && computed != null && Math.abs(simulated - computed) >= .05 && <em>{simulated > computed ? '+' : '−'}{Math.abs(simulated - computed).toFixed(1)}</em>}</strong>
              <span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, simulated ?? 0))}%` }}/></span>
            </div>
          </div>
        </section>}
        <section><div class="g-section-head"><h2 class="g-h-sans">Assignments</h2><button class="g-icon-btn bordered" onClick={() => exportCalendar(tasks.filter(t => t.course.id === active.id && pending(t.assignment) && dueDate(t.assignment) >= Date.now()), snapshot.origin)} aria-label="Download upcoming deadlines" title="Download upcoming deadlines"><Icon name="calendar" size={16}/></button></div>
          <div class="g-search"><Icon name="search" size={16}/><input aria-label="Search coursework" placeholder="Find an assignment" value={query} onInput={e => setQuery(e.currentTarget.value)}/></div>
          <div class="g-chips g-filter" role="group" aria-label="Filter assignments">{([{ value: 'todo', label: 'To do' }, { value: 'submitted', label: 'Handed in' }, { value: 'graded', label: 'Marked' }, { value: 'all', label: 'All work' }] as const).map(f => <button key={f.value} class={`g-chip ${filter === f.value ? 'active' : ''}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}</div>
          <div class="g-card g-list">{activeTasks.length ? activeTasks.map(task => <TaskRow key={task.assignment.id} task={task} snapshot={snapshot} gradeImpact={activePriorities.get(task.assignment.id)?.gradeImpact} onSelect={() => setAssignmentId(task.assignment.id)}/>) : <Empty title="Nothing here">Try another filter.</Empty>}</div></section>
        {simAssignment && <>
          <section id="offcanvas-priority-assignment" class="g-card" tabIndex={-1} aria-label="Selected assignment context">
            <div class="g-section-head"><h2>{simAssignment.name}</h2><a class="g-link-btn" href={safeLink(simAssignment.htmlUrl)}>Canvas <Icon name="external" size={14}/></a></div>
            <p class="g-small g-assignment-brief">{plain(simAssignment.descriptionHtml) || 'Canvas did not share the instructions for this assignment. Open it in Canvas to read what is required.'}</p>
            <div class="g-row-actions">
              <button class="g-secondary" onClick={() => explainAssignment(active.id, simAssignment.id)}><Icon name="book" size={15}/>Explain assignment</button>
              <button class="g-secondary" onClick={() => explainAssignment(active.id, simAssignment.id, true)}><Icon name="spark" size={15}/>Homework Autopilot</button>
              {canTargetAssignmentGrade(simAssignment) && <button class="g-link-btn" onClick={() => bodyRef.current?.querySelector<HTMLElement>('#offcanvas-grade-target')?.focus()}>Grade target</button>}
            </div>
          </section>
          <AssignmentFeedback assignment={simAssignment} accountScope={accountScope} courseId={active.id}/>
        </>}
        <section class="g-card" aria-label="Study plan">
          <div class="g-section-head"><h2>Study plan</h2></div>
          <label class="g-field-label">Which courses
            <select class="g-select" aria-label="Study plan scope" value={planningScope} onChange={e => setPlanningScope(e.currentTarget.value as 'course' | 'all')}>
              <option value="all">All courses</option><option value="course">Selected course</option>
            </select>
          </label>
          <div class="g-plan-controls">
            <label class="g-hours"><input aria-label="Study hours available" type="number" min=".5" max="30" step=".5" value={hours} onChange={e => setHours(Math.max(.5, Math.min(30, Number(e.currentTarget.value) || .5)))}/>hours free</label>
            <button class="g-primary" onClick={buildPlan} disabled={planning}>{planning ? <><Icon name="refresh" size={15} className="g-spinner"/>Planning…</> : <>Build my study plan <Icon name="arrow" size={15}/></>}</button>
          </div>
          {planError && <p class="g-notice" role="alert">{planError}</p>}
          {plan && <div class="g-plan-result">
            <div aria-live="polite">
              {plan.length ? plan.map(item => <div key={item.id} class="g-plan-row">
                <div><strong>{item.name}</strong><small>{item.code}</small></div>
                <span class="g-mini-bar" aria-hidden="true"><i style={{ width: `${item.hours / hours * 100}%` }}/></span>
                <span class="g-plan-hours">{item.hours.toFixed(1)} h</span>
              </div>) : <p class="g-small">No study blocks suggested.</p>}
              <p class="g-small g-plan-total">{allocatedHours.toFixed(1)} of {hours} hours allocated.{unallocatedHours >= .05 && ` ${unallocatedHours.toFixed(1)} hours unallocated.`}</p>
            </div>
            {firstBlock && <StudyBlockCalendar key={JSON.stringify([accountScope, firstBlock.id, firstBlock.hours])}
              accountScope={accountScope} recommendation={firstBlock}/>}
          </div>}
        </section>
      </> : <Empty title="No courses to show">Courses appear after a sync.</Empty>}</div>}
      </>}
      {snapshot && gradesOpened.current && <div hidden={tab !== 'academics' || academicView !== 'grades'}>{creditError && <p class="g-notice" role="alert">{creditError}</p>}<GradeLab key={accountScope} snapshot={snapshot} credits={credits} gradePointScale={gradeScale}/></div>}
      {snapshot && tab === 'academics' && academicView === 'coursework' && <div class="g-after"><DeadlineTracker key={accountScope} snapshot={snapshot} preview={preview} onPanic={openPanic}/></div>}
      {snapshot && (assistantOpened || tab === 'assistant') && <div key="local-assistant" hidden={tab !== 'assistant'}><AssistantView key={accountScope} snapshot={snapshot} preview={preview} initialCourseId={selectedCourseId || initialCourseId} initialAssignmentId={initialAssignmentId} focus={assistantFocus} onAcademicAction={(courseId, assignmentId) => { selectCourse(courseId); setAssignmentId(assignmentId); openAcademic('coursework'); }}/></div>}
      {(snapshot || showingPageRun) && (automationOpened || tab === 'automation') && <div hidden={tab !== 'automation'} class="g-stack"><div><span class="g-eyebrow">Hands-free, with your approval</span><h1 class="g-title">Automation</h1><p class="g-subtitle">Copy coursework into your local Canvas practice copy, run a permitted workflow there, and review the evidence it leaves behind.</p></div><p class="g-notice info"><Icon name="shield" size={16}/><span>{preview ? 'Sample data. Open the local Canvas tab to run automation.' : 'Your real Canvas stays read-only. A local copy is only made after you approve it.'}</span></p>{snapshot&&<CanvasMirror key={`mirror:${accountScope}`} snapshot={snapshot}/>}<AutoWorkflow key={`automation:${accountScope}`} snapshot={snapshot??undefined} preview={preview} panicTarget={panicTarget?.accountScope === accountScope ? panicTarget : undefined}/></div>}
      {snapshot && context && (researchOpened || tab === 'research') && <div hidden={tab !== 'research'}><ReuFinder key={accountScope} snapshot={snapshot} context={context}/></div>}
    </div>}
    <footer class="g-statusbar"><span class={`g-status-dot${preview || presentationDemo ? ' demo' : ''}`} aria-hidden="true"/><span>{preview ? 'Synthetic demo' : 'Read-only Canvas'}</span>{snapshot && <><span aria-hidden="true">·</span><span>Synced {syncedAt}</span><span class="g-statusbar-right">{snapshot.user.shortName || snapshot.user.name} · {courses.length} {courses.length === 1 ? 'course' : 'courses'}</span></>}</footer>
  </aside></>;
}
