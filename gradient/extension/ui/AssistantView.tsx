import { z } from 'zod';
import { renderToString } from 'katex';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CanvasSnapshot, CanvasLiveAssignment } from '../liveCanvas.js';
import type { AssistantHealth, AssistantSettings, BrowserPlan, DetailLevel, StudyDiagram, StudyPacket, StudyProgress } from '../assistantTypes.js';
import { enableBrowserSearch, applyBrowserAction, captureBrowserContext, generateStudyPacket, getAssistantHealth, loadAssistantSettings, planBrowserAction, saveAssistantSettings } from '../assistantClient.js';
import { Icon } from './Icons.js';
import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import { AutopilotProgress, WorkEvidence, ComputedVisuals } from './WorkEvidence.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';

const DEFAULTS: AssistantSettings = { backendUrl: 'http://127.0.0.1:8765', reasoningModel: 'gpt-oss:20b', visionModel: 'gemma4:e4b', detailLevel: 'a_bit_more', webResearch: true };
const LEVELS: { id: DetailLevel; title: string; description: string }[] = [
  { id: 'a_bit', title: 'A bit', description: 'Key ideas + a starting point' },
  { id: 'a_bit_more', title: 'A bit more', description: 'Worked explanations + sources' },
  { id: 'all_in', title: 'Go all in', description: 'A complete research packet' },
];
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The local assistant could not complete this request.'; }
function installedModels(health: AssistantHealth | null, capability: 'completion' | 'vision'): string[] {
  if (!health) return [];
  const raw = [...new Set(health.models)].filter(name => {
    const detail = health.modelDetails?.find(model => model.name === name);
    if (detail?.remote || /(?:-cloud|:cloud)$/.test(name)) return false;
    return detail ? detail.capabilities.includes(capability) : capability === 'completion';
  });
  const humanNames = raw.filter(name => !/^llamacpp[:/]/i.test(name));
  return humanNames.length ? humanNames : raw;
}
function modelLabel(name: string, health: AssistantHealth | null): string {
  const detail = health?.modelDetails?.find(model => model.name === name);
  const size = detail && detail.size > 0 ? `${(detail.size / 1024 ** 3).toFixed(1)} GB` : '';
  return [name, detail?.parameterSize, detail?.quantization, size].filter(Boolean).join(' · ');
}
function recommendedSettings(health: AssistantHealth, current: AssistantSettings): Partial<AssistantSettings> {
  const patch: Partial<AssistantSettings> = {};
  for (const [key, capability] of [['reasoningModel', 'completion'], ['visionModel', 'vision']] as const) {
    const candidates = installedModels(health, capability);
    if (candidates.includes(current[key])) continue;
    const recommended = health.recommended?.[key];
    const replacement = recommended && candidates.includes(recommended) ? recommended : candidates[0];
    if (replacement) patch[key] = replacement;
  }
  return patch;
}
function safeUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function plain(value: string): string {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach(node => node.remove());
  doc.querySelectorAll('p,br,li,h1,h2,h3,div').forEach(node => node.append(doc.createTextNode('\n')));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
function MathFormula({tex, display = false}: {tex:string; display?:boolean}) {
  try {
    const html = renderToString(tex.replace(/\\n(?![A-Za-z])/g, '\n').replace(/\\\[(\d+(?:\.\d+)?(?:pt|em|ex))\]/g, '\\\\[$1]'), {output: 'mathml', displayMode: display, trust: false, throwOnError: true, maxExpand: 300, maxSize: 20});
    return <span class={display ? 'ja-math display' : 'ja-math'} dangerouslySetInnerHTML={{__html: html}}/>;
  } catch { return <code class="ja-math-error" title="Unsupported or incomplete formula">{tex}</code>; }
}
function inline(text: string): ComponentChildren[] {
  const nodes: ComponentChildren[] = [];
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\\\(([^]*?)\\\)|\$([^$\n]+)\$/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > start) nodes.push(text.slice(start, index));
    if (match[1] !== undefined) {
      const href = safeUrl(match[2] ?? '');
      nodes.push(href ? <a href={href} target="_blank" rel="noopener noreferrer">{match[1]}</a> : match[1]);
    } else if (match[3] !== undefined) nodes.push(<strong>{match[3]}</strong>);
    else if (match[4] !== undefined) nodes.push(<code>{match[4]}</code>);
    else nodes.push(<MathFormula tex={match[5] ?? match[6] ?? ""}/>);
    start = index + match[0].length;
  }
  if (start < text.length) nodes.push(text.slice(start));
  return nodes;
}
const embeddedDiagramSchema = z.object({
  title: z.string().max(300),
  nodes: z.array(z.object({id:z.string().max(100),label:z.string().max(500)})).min(1).max(16),
  edges: z.array(z.object({from:z.string(),to:z.string(),label:z.string().max(300).optional()})).max(40),
}).refine(d => new Set(d.nodes.map(n => n.id)).size === d.nodes.length && d.edges.every(e => d.nodes.some(n => n.id === e.from) && d.nodes.some(n => n.id === e.to)));
function embeddedDiagram(text:string): StudyDiagram | null {
  if (text.length > 30000) return null;
  try { const parsed = embeddedDiagramSchema.safeParse(JSON.parse(text)); return parsed.success ? parsed.data : null; } catch { return null; }
}
/** Markdown stays in Preact text nodes; model output cannot inject HTML or scripts. */
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks: ComponentChildren[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('{')) {
      let candidate = '';
      let end = i;
      let diagram:StudyDiagram|null = null;
      for (; end < Math.min(lines.length, i + 150); end++) {
        candidate += (candidate ? '\n' : '') + lines[end];
        if (candidate.length > 30000) break;
        diagram = embeddedDiagram(candidate);
        if (diagram) break;
      }
      if (diagram) { blocks.push(<div class="ja-notice warning">A model-proposed diagram was omitted. Generate a new packet to build a Python-rendered figure from the assignment evidence.</div>); i = end; continue; }
    }
    const delimiter = trimmed.startsWith('$$') ? '$$' : trimmed.startsWith('\\[') ? '\\[' : null;
    if (delimiter) {
      const close = delimiter === '$$' ? '$$' : '\\]';
      let formula = trimmed.slice(delimiter.length);
      while (!formula.trimEnd().endsWith(close) && i + 1 < lines.length) formula += '\n' + (lines[++i] ?? '');
      if (formula.trimEnd().endsWith(close)) formula = formula.trimEnd().slice(0, -close.length);
      blocks.push(<div class="ja-math-block"><MathFormula tex={formula.trim()} display/></div>); continue;
    }
    if (/^```/.test(line)) {
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i] ?? '')) code.push(lines[i] ?? '');
      const diagram = embeddedDiagram(code.join('\n'));
      blocks.push(diagram ? <div class="ja-notice warning">A model-proposed diagram was omitted. Generate a new packet to build a Python-rendered figure from the assignment evidence.</div> : <pre><code>{code.join('\n')}</code></pre>); continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
      const headers = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) rows.push(cells(lines[i++] ?? ''));
      i--;
      blocks.push(<div class="ja-table-wrap"><table><thead><tr>{headers.map((header, index) => <th key={index}>{inline(header)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((_header, column) => <td key={column}>{inline(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const children = inline(heading[2] ?? '');
      blocks.push((heading[1]?.length ?? 1) <= 2 ? <h2>{children}</h2> : (heading[1]?.length ?? 3) === 3 ? <h3>{children}</h3> : <h4>{children}</h4>); continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push(<hr/>); continue; }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ComponentChildren[] = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      do { items.push(<li>{inline((lines[i] ?? '').replace(pattern, ''))}</li>); i++; } while (i < lines.length && pattern.test(lines[i] ?? ''));
      i--; blocks.push(ordered ? <ol>{items}</ol> : <ul>{items}</ul>); continue;
    }
    if (/^>\s?/.test(line)) { blocks.push(<blockquote>{inline(line.replace(/^>\s?/, ''))}</blockquote>); continue; }
    const paragraph = [line];
    while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() && !/^(?:#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\s*\{|\s*(?:\$\$|\\\[))/.test(lines[i + 1] ?? '')) paragraph.push(lines[++i] ?? '');
    blocks.push(<p>{inline(paragraph.join('\n'))}</p>);
  }
  return <div class="ja-prose">{blocks}</div>;
}
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename(title: string): string { return title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'gradient-study-packet'; }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function packetMarkdown(packet: StudyPacket): string {
  const figures = (packet.renderedVisuals ?? []).map(figure => `## ${figure.title}\n\n![${figure.title.replace(/[\[\]]/g, '')}](data:image/png;base64,${figure.data})\n\n${figure.caption}\n\nEvidence [${figure.provenance.sourceId}]: ${figure.provenance.quote}`);
  const requirements = packet.brief ? `## Assignment requirements\n\n${packet.brief.requirements.map(item => `- ${item.text}\n  - Instruction: ${item.evidence}\n  - Review: ${packet.review?.coverage.find(check => check.requirementId === item.id)?.status ?? 'not reviewed'}`).join('\n')}` : '';
  return [`# ${packet.title}`, packet.summary, packet.markdown,
    packet.sampleMarkdown ? `## Sample assignment for review\n\n${packet.sampleMarkdown}` : '',
    ...figures, requirements,
    ...(packet.images.filter(image => safeUrl(image.url) && safeUrl(image.sourceUrl)).map(image => `![${image.alt.replace(/[\[\]]/g, '')}](${safeUrl(image.url)})\n[Image source](${safeUrl(image.sourceUrl)})`)),
    `## Sources\n\n${packet.sources.filter(source => safeUrl(source.url)).map(source => `- [${source.title.replace(/[\[\]]/g, '')}](${safeUrl(source.url)})${source.excerpt ? `: ${source.excerpt}` : ''}`).join('\n')}`,
    packet.warnings.length ? `## Notes to verify\n\n${packet.warnings.map(warning => `- ${warning}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n') + '\n';
}
function assignmentBrief(assignment: CanvasLiveAssignment | undefined): string { return assignment ? plain(assignment.descriptionHtml) : ''; }

export interface AssistantFocus { courseId?: string; assignmentId?: string; autopilot?: boolean; nonce?: number }
export interface AssistantViewProps { snapshot: CanvasSnapshot; preview?: boolean; initialCourseId?: string; initialAssignmentId?: string; focus?: AssistantFocus }
export function AssistantView({ snapshot, initialCourseId, initialAssignmentId, focus }: AssistantViewProps) {
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULTS);
  const [health, setHealth] = useState<AssistantHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [courseId, setCourseId] = useState(initialCourseId ?? snapshot.courses[0]?.id ?? '');
  const course = snapshot.courses.find(item => item.id === courseId) ?? snapshot.courses[0];
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? '');
  const assignment = course?.assignments.find(item => item.id === assignmentId) ?? course?.assignments.find(item => !item.submission?.excused && item.submission?.score == null && !['submitted', 'pending_review', 'graded'].includes(item.submission?.workflowState ?? '')) ?? course?.assignments[0];
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'explain' | 'sample'>('explain');
  const [autopilot, setAutopilot] = useState(false);
  const [homeworkConfirmed, setHomeworkConfirmed] = useState(false);
  const [workProgress, setWorkProgress] = useState<StudyProgress | null>(null);
  const autopilotBlock = homeworkAutopilotBlock(assignment);
  useEffect(() => { setHomeworkConfirmed(false); }, [course?.id, assignment?.id]);
  useEffect(() => {
    if (!focus) return;
    if (focus.courseId) setCourseId(focus.courseId);
    if (focus.assignmentId) setAssignmentId(focus.assignmentId);
    if (focus.autopilot) { setAutopilot(true); setMode('sample'); }
  }, [focus?.nonce]);
  const [visuals, setVisuals] = useState({ diagrams: true, graphs: true, images: true });
  const [generating, setGenerating] = useState(false);
  const [packet, setPacket] = useState<StudyPacket | null>(null);
  const [generationError, setGenerationError] = useState('');
  const [browserGoal, setBrowserGoal] = useState('Find the assignment instructions and the course materials that will help me.');
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserPlan, setBrowserPlan] = useState<BrowserPlan | null>(null);
  const [browserError, setBrowserError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const resultRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const settingsRef = useRef<AssistantSettings>(DEFAULTS);
  const earlySettingsEdits = useRef<Partial<AssistantSettings>>({});
  const settingsLoaded = useRef(false);
  const healthRequest = useRef(0);
  const reasoningModels = installedModels(health, 'completion');
  const visionModels = installedModels(health, 'vision');
  const ready = health?.ok && health.ollamaConnected && reasoningModels.includes(settings.reasoningModel);
  const visionReady = health?.ok && health.ollamaConnected && visionModels.includes(settings.visionModel);
  const brief = assignmentBrief(assignment);
  const resources = useMemo(() => {
    const words = new Set(`${assignment?.name ?? ''} ${brief.slice(0, 1000)}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    return (course?.resources ?? []).map(resource => ({ resource, rank: (resource.title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(word => words.has(word)).length })).sort((a, b) => b.rank - a.rank).slice(0, 12).map(item => item.resource);
  }, [course, assignment, brief]);
  useEffect(() => {
    mounted.current = true;
    loadAssistantSettings().then(async saved => {
      if (!mounted.current) return;
      const initial = { ...saved, ...earlySettingsEdits.current };
      settingsLoaded.current = true; settingsRef.current = initial; setSettings(initial);
      await checkHealth(initial);
    }).catch(error => { if (mounted.current) setConnectionError(errorMessage(error)); });
    return () => { mounted.current = false; healthRequest.current++; };
  }, []);
  const updateSettings = (patch: Partial<AssistantSettings>) => {
    if (!settingsLoaded.current) earlySettingsEdits.current = { ...earlySettingsEdits.current, ...patch };
    settingsRef.current = { ...settingsRef.current, ...patch };
    setSettings(current => ({ ...current, ...patch }));
    if (patch.backendUrl !== undefined) { healthRequest.current++; setChecking(false); setHealth(null); }
    saveAssistantSettings(patch).catch(error => { if (mounted.current) setConnectionError(errorMessage(error)); });
  };
  const checkHealth = async (requestSettings: AssistantSettings) => {
    const requestId = ++healthRequest.current;
    const currentRequest = () => mounted.current && requestId === healthRequest.current && settingsRef.current.backendUrl === requestSettings.backendUrl;
    setChecking(true); setConnectionError('');
    try {
      const status = await getAssistantHealth(requestSettings);
      if (!currentRequest()) return;
      setHealth(status);
      const patch = recommendedSettings(status, settingsRef.current);
      if (Object.keys(patch).length) {
        settingsRef.current = { ...settingsRef.current, ...patch };
        setSettings(current => ({ ...current, ...patch }));
        await saveAssistantSettings(patch);
      }
    } catch (error) { if (currentRequest()) { setHealth(null); setConnectionError(errorMessage(error)); } }
    finally { if (currentRequest()) setChecking(false); }
  };
  const checkConnection = () => checkHealth(settingsRef.current);
  const generate = async () => {
    if (!course || !assignment || generating) return;
    if (autopilot && (autopilotBlock || !homeworkConfirmed)) { setGenerationError(autopilotBlock || 'Confirm that this is homework before starting autopilot.'); return; }
    setGenerating(true); setGenerationError(''); setWorkProgress(null);
    try {
      const preferences = `Use only evidence-based Python-rendered figures. No illustrative invented data. Visual preferences: ${visuals.diagrams ? 'include diagrams only when the source explicitly supports the relationships' : 'omit diagrams'}; ${visuals.graphs ? 'plot only explicit equations or source datasets requested by the assignment' : 'omit graphs'}; ${visuals.images ? 'include only relevant, attributed images from retrieved resources when available' : 'omit images'}. Never invent sources, measurements, or image URLs.`;
      const result = await generateStudyPacket(settings, {
        autopilot, assignmentKind: autopilot && homeworkConfirmed ? 'homework' : 'other', visualPreferences: visuals,
        course: { id: course.id, name: course.name, code: course.code },
        assignment: { id: assignment.id, title: assignment.name, description: brief, url: assignment.htmlUrl, submissionTypes: assignment.submissionTypes, dueAt: assignment.dueAt ?? null, rubric: assignment.rubric?.map(criterion => `${plain(criterion.description)} (${criterion.points} points): ${criterion.ratings.map(rating => plain(rating.description)).join('; ')}`).join('\n') },
        prompt: `${prompt.trim()}\n\n${preferences}`, level: autopilot ? 'all_in' : settings.detailLevel, mode: autopilot ? 'sample' : mode, model: settings.reasoningModel, webResearch: settings.webResearch,
        resources: resources.map(resource => ({ title: resource.title, url: resource.url })),
      }, progress => { if (mounted.current) setWorkProgress(progress); });
      if (mounted.current) setPacket({ ...result, diagrams: [], graphs: [], renderedVisuals: result.renderedVisuals?.filter(figure => figure.kind==='diagram' ? visuals.diagrams : visuals.graphs), images: visuals.images ? result.images : [] });
    } catch (error) { if (mounted.current) setGenerationError(errorMessage(error)); } finally { if (mounted.current) setGenerating(false); }
  };
  const inspectPage = async () => {
    setBrowserBusy(true); setBrowserError(''); setActionMessage('');
    try { const context = await captureBrowserContext(); const plan = await planBrowserAction(settings, { ...context, goal: browserGoal, model: settings.visionModel }); if (mounted.current) setBrowserPlan(plan); }
    catch (error) { if (mounted.current) setBrowserError(errorMessage(error)); } finally { if (mounted.current) setBrowserBusy(false); }
  };
  const exportHtml = () => {
    if (!packet || !resultRef.current) return;
    download(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(packet.title)}</title><style>body{margin:0;background:#fff8f1;font-family:Figtree,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:30px 15px}main{max-width:850px;margin:auto}${ASSISTANT_STYLES}.ja{border:0}.ja-result{border:0}.ja-result-header{padding:30px}.ja-result-body{padding:30px}@media print{body{background:white;padding:0}.ja{border:0}.ja-result{overflow:visible}.ja-result-header,.ja-result-body{padding:15px}.ja-visual{break-inside:avoid}a{overflow-wrap:anywhere}}</style></head><body><main class="ja"><article class="ja-result">${resultRef.current.innerHTML}</article></main></body></html>`, `${filename(packet.title)}.html`, 'text/html;charset=utf-8');
  };

  return <><style>{ASSISTANT_STYLES}</style><section class="ja" aria-label="Local AI study assistant">
    <header class="ja-head"><div class="ja-core" aria-hidden="true"><span><Icon name="spark" size={20}/></span></div><h1>Assistant</h1><span class="ja-status"><i class={`ja-led ${ready ? 'ready' : ''}`}/>{checking ? 'Connecting' : ready ? 'Local AI ready' : 'Setup needed'}</span></header>
    <div class="ja-inner">
      <section class="ja-section"><div class="ja-fields two">
        <label><span class="ja-label">Course</span><select class="ja-control" aria-label="Assistant course" value={course?.id ?? ''} disabled={generating} onChange={e => { setCourseId(e.currentTarget.value); setAssignmentId(''); }}>{snapshot.courses.map(item => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span class="ja-label">Assignment</span><select class="ja-control" aria-label="Assistant assignment" value={assignment?.id ?? ''} disabled={generating || !course?.assignments.length} onChange={e => setAssignmentId(e.currentTarget.value)}>{course?.assignments.length ? course.assignments.map(item => <option value={item.id} key={item.id}>{item.name}</option>) : <option value="">No assignments available</option>}</select></label>
      </div>{assignment && brief && <details class="ja-context"><summary>{assignment.dueAt && Number.isFinite(Date.parse(assignment.dueAt)) ? `Due ${new Date(assignment.dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Brief'}</summary><div class="ja-brief">{brief}</div></details>}</section>

      <section class="ja-autopilot" aria-label="Homework autopilot">
        <div class="ja-row"><h2>Homework autopilot</h2><button class={`ja-toggle ${autopilot ? 'active' : ''}`} role="switch" aria-checked={autopilot} aria-label="Homework autopilot" disabled={generating} onClick={()=>setAutopilot(!autopilot)}>{autopilot?'On':'Off'}<span/></button></div>
        {autopilot && (autopilotBlock ? <div class="ja-notice warning" role="alert">{autopilotBlock}</div> : <label class="ja-switch ja-homework-confirm"><input type="checkbox" checked={homeworkConfirmed} disabled={generating} onChange={e=>setHomeworkConfirmed(e.currentTarget.checked)}/>This is homework, not an exam, quiz, or timed assessment.</label>)}
      </section>
      <section class="ja-section"><label class="ja-label" for="ja-prompt">Anything you want me to focus on?</label><textarea id="ja-prompt" class="ja-control" rows={2} value={prompt} disabled={generating} onInput={e => setPrompt(e.currentTarget.value)} placeholder="Hard parts, diagrams, a full sample…"/>
        <button class="ja-btn primary full" style={{ marginTop: '14px' }} disabled={!ready || !assignment || generating || (autopilot && (!!autopilotBlock || !homeworkConfirmed))} onClick={generate}>{generating ? <><Icon name="refresh" size={18} className="g-spinner"/>Working…</> : <><Icon name="spark" size={18}/>{autopilot ? 'Run homework autopilot' : mode === 'sample' ? 'Create my sample assignment' : 'Build my study packet'}</>}</button>
        {generating && <AutopilotProgress progress={workProgress}/>}
        {generationError && <div class="ja-notice error" role="alert" style={{ marginTop: '10px' }}>{generationError}</div>}
      </section>
      <section class="ja-section"><div class="ja-detail" hidden={autopilot} role="group" aria-label="Response detail level">{LEVELS.map(level => <button key={level.id} class={settings.detailLevel === level.id ? 'active' : ''} aria-pressed={settings.detailLevel === level.id} disabled={generating} onClick={() => updateSettings({ detailLevel: level.id })}><strong>{level.title}</strong></button>)}</div>
        <div hidden={autopilot} class="ja-mode" role="group" aria-label="Assistant output type"><button class={`ja-btn ${mode === 'explain' ? 'active' : ''}`} aria-pressed={mode === 'explain'} disabled={generating} onClick={() => setMode('explain')}>Study</button><button class={`ja-btn ${mode === 'sample' ? 'active' : ''}`} aria-pressed={mode === 'sample'} disabled={generating} onClick={() => setMode('sample')}>Sample assignment</button></div>
      </section>

      {packet && <section aria-label="Generated study packet"><article class="ja-result" ref={resultRef}><header class="ja-result-header"><h2>{packet.title}</h2><p>{packet.summary}</p></header><div class="ja-result-body"><AssistantMarkdown text={packet.markdown}/><ComputedVisuals packet={packet}/><WorkEvidence packet={packet}/>{packet.images.filter(image => safeUrl(image.url) && safeUrl(image.sourceUrl)).map((image, i) => <figure class="ja-visual" key={i}><figcaption>{image.title}</figcaption><img src={safeUrl(image.url)} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }}/><a href={safeUrl(image.sourceUrl)} target="_blank" rel="noopener noreferrer">View image source</a></figure>)}{packet.sampleMarkdown && <section class="ja-sample"><AssistantMarkdown text={packet.sampleMarkdown}/></section>}{!!packet.checklist?.length && <section class="ja-sample"><h3>Before you finish</h3><ul class="ja-checklist">{packet.checklist.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}{packet.warnings.map((warning, i) => <p class="ja-note" key={i} style={{ marginTop: '10px' }}>{warning}</p>)}<section class="ja-sources"><h3>Sources</h3>{packet.sources.length ? <ol>{packet.sources.map((source, i) => <li key={source.id || i}>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : <strong>{source.title}</strong>}{source.excerpt && <p>{source.excerpt}</p>}</li>)}</ol> : <p class="ja-note">No verified sources returned.</p>}</section></div></article><div class="ja-export"><button class="ja-btn" onClick={exportHtml}><Icon name="download" size={16}/>Export illustrated HTML</button><button class="ja-btn" onClick={() => download(packetMarkdown(packet), `${filename(packet.title)}.md`, 'text/markdown;charset=utf-8')}><Icon name="download" size={16}/>Markdown</button></div></section>}

      <details class="ja-settings" open={!ready}><summary><Icon name="settings" size={16}/>Models</summary><div class="ja-fields">
        <label><span class="ja-label">Local assistant service</span><input class="ja-control" aria-label="Local assistant service URL" type="url" value={settings.backendUrl} disabled={generating} onChange={e => updateSettings({ backendUrl: e.currentTarget.value })} placeholder="http://127.0.0.1:8765"/></label>
        <div><label class="ja-label" for="ja-reasoning-model">Reasoning</label><select id="ja-reasoning-model" class="ja-control" value={settings.reasoningModel} disabled={generating || checking || !reasoningModels.length} onChange={e => updateSettings({ reasoningModel: e.currentTarget.value })}>{reasoningModels.length ? reasoningModels.map(name => <option key={name} value={name}>{modelLabel(name, health)}{health?.recommended?.reasoningModel === name ? ' · Recommended' : ''}</option>) : <option value="">Connect Ollama to discover your installed models</option>}</select></div>
        <div><label class="ja-label" for="ja-vision-model">Vision</label><select id="ja-vision-model" class="ja-control" value={settings.visionModel} disabled={browserBusy || checking || !visionModels.length} onChange={e => updateSettings({ visionModel: e.currentTarget.value })}>{visionModels.length ? visionModels.map(name => <option key={name} value={name}>{modelLabel(name, health)}{health?.recommended?.visionModel === name ? ' · Recommended' : ''}</option>) : <option value="">No installed vision model detected</option>}</select></div>
        <button class="ja-btn" disabled={checking} onClick={checkConnection}><Icon name="refresh" size={15} className={checking ? 'g-spinner' : ''}/>{checking ? 'Checking…' : 'Check connection'}</button>
        {health && <p class="ja-note">{health.ollamaConnected ? `${health.models.length} model${health.models.length === 1 ? '' : 's'} ready` : health.message ?? 'Start Ollama, then check again.'}</p>}
        {health?.recommended && reasoningModels.includes(health.recommended.reasoningModel) && visionModels.includes(health.recommended.visionModel) && (settings.reasoningModel !== health.recommended.reasoningModel || settings.visionModel !== health.recommended.visionModel) && <button class="ja-btn" disabled={generating || browserBusy} onClick={() => updateSettings({ reasoningModel: health.recommended!.reasoningModel, visionModel: health.recommended!.visionModel })}><Icon name="bolt" size={15}/>Use recommended pair</button>}
        {!ready && <div class="ja-setup"><strong>Start the local engine</strong><code>make assistant</code></div>}
        {connectionError && <div class="ja-notice error" role="alert">{connectionError}</div>}
      </div></details>
      <details class="ja-more"><summary>More</summary><div>
        <div class="ja-switches"><label class="ja-switch"><input type="checkbox" checked={settings.webResearch} disabled={generating} onChange={e => updateSettings({ webResearch: e.currentTarget.checked })}/>Research the web</label>{(['diagrams', 'graphs', 'images'] as const).map(key => <label class="ja-switch" key={key}><input type="checkbox" checked={visuals[key]} disabled={generating} onChange={e => setVisuals({ ...visuals, [key]: e.currentTarget.checked })}/>{key[0]?.toUpperCase()}{key.slice(1)}</label>)}</div>
        <button class="ja-btn" style={{marginTop:'12px',marginRight:'8px'}} onClick={async()=>{try { const granted=await enableBrowserSearch(); setGenerationError(granted?'': 'Google access was not enabled.'); } catch(error){setGenerationError(errorMessage(error));}}}>Enable Google search</button>
        <section class="ja-browser"><label style={{ display: 'block', marginTop: '12px' }}><span class="ja-label">Page goal</span><textarea class="ja-control" aria-label="Browser companion goal" rows={2} value={browserGoal} disabled={browserBusy} onInput={e => setBrowserGoal(e.currentTarget.value)}/></label><button class="ja-btn full" style={{ marginTop: '10px' }} disabled={!visionReady || browserBusy || !browserGoal.trim()} onClick={inspectPage}><Icon name={browserBusy ? 'refresh' : 'search'} size={16} className={browserBusy ? 'g-spinner' : ''}/>{browserBusy ? `Inspecting with ${settings.visionModel}…` : 'Inspect this Canvas page'}</button>{browserError && <div class="ja-notice error" role="alert" style={{ marginTop: '9px' }}>{browserError}</div>}{browserPlan && <div style={{ marginTop: '12px' }}><p class="ja-note">{browserPlan.summary}</p><ol class="ja-browser-steps">{browserPlan.actions.map((action, i) => <li key={i}><strong>{i + 1}. {action.kind === 'open' ? 'Open a resource' : action.kind === 'find' ? 'Find on this page' : action.kind === 'scroll' ? 'Move through the page' : 'Read this section'}</strong><p>{action.description}</p><button class="ja-btn" onClick={async () => { try { await applyBrowserAction(action); setActionMessage(`Step ${i + 1}: ${action.description}`); } catch (error) { setBrowserError(errorMessage(error)); } }}>{action.kind === 'open' ? 'Open link' : action.kind === 'find' ? 'Find text' : action.kind === 'scroll' ? 'Scroll' : 'Show section'}<Icon name="arrow" size={14}/></button></li>)}</ol>{browserPlan.warnings.map((warning, i) => <p class="ja-note" key={i}>{warning}</p>)}</div>}{actionMessage && <p class="ja-note" role="status">{actionMessage}</p>}</section>
      </div></details>
    </div>
  </section></>;
}
