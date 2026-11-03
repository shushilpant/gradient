import { z } from 'zod';
import { renderToString } from 'katex';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CanvasSnapshot, CanvasLiveAssignment } from '../liveCanvas.js';
import type { AssistantHealth, AssistantSettings, BrowserPlan, DetailLevel, StudyDiagram, StudyGraph, StudyPacket } from '../assistantTypes.js';
import { enableBrowserSearch, applyBrowserAction, captureBrowserContext, generateStudyPacket, getAssistantHealth, loadAssistantSettings, planBrowserAction, saveAssistantSettings } from '../assistantClient.js';
import { Icon } from './Icons.js';
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
    const html = renderToString(tex, {output: 'mathml', displayMode: display, trust: false, throwOnError: true, maxExpand: 300, maxSize: 20});
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
      if (diagram) { blocks.push(<ConceptDiagram diagram={diagram}/>); i = end; continue; }
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
      blocks.push(diagram ? <ConceptDiagram diagram={diagram}/> : <pre><code>{code.join('\n')}</code></pre>); continue;
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
    while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() && !/^(?:#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\s*\{)/.test(lines[i + 1] ?? '')) paragraph.push(lines[++i] ?? '');
    blocks.push(<p>{inline(paragraph.join('\n'))}</p>);
  }
  return <div class="ja-prose">{blocks}</div>;
}
function ConceptDiagram({ diagram }: { diagram: StudyDiagram }) {
  const nodes = diagram.nodes.slice(0, 16);
  const labels = new Map(nodes.map(node => [node.id, node.label]));
  return <figure class="ja-visual"><figcaption>{diagram.title}</figcaption><div role="img" aria-label={`${diagram.title}: ${nodes.map(node => node.label).join(', ')}`}>
    {nodes.map((node, i) => { const edge = diagram.edges.find(item => item.from === node.id && item.to === nodes[i + 1]?.id); return <div key={node.id}><div class="ja-diagram-node">{node.label}</div>{edge ? <div class="ja-diagram-edge"><span aria-hidden="true">↓</span><span>{edge.label ?? ''}</span></div> : i < nodes.length - 1 ? <div style={{ height: '9px' }}/> : null}</div>; })}
    {diagram.edges.filter(edge => !nodes.some((node, i) => node.id === edge.from && nodes[i + 1]?.id === edge.to)).map((edge, i) => <div class="ja-diagram-edge" key={i}><span aria-hidden="true">↳</span><span>{labels.get(edge.from) ?? edge.from} → {labels.get(edge.to) ?? edge.to}{edge.label ? `: ${edge.label}` : ''}</span></div>)}
  </div></figure>;
}
function DataGraph({ graph }: { graph: StudyGraph }) {
  const points = graph.points.filter(point => Number.isFinite(point.value)).slice(0, 16);
  if (!points.length) return null;
  const maximum = Math.max(1, ...points.map(point => Math.abs(point.value)));
  const width = 420, height = Math.max(130, 43 + points.length * 29);
  const displayValue = (value: number) => Math.abs(value) >= 1e12 || (value !== 0 && Math.abs(value) < .001) ? value.toExponential(2) : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return <figure class="ja-visual"><figcaption>{graph.title}</figcaption><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={graph.title}>
    {points.map((point, i) => <g key={i}><text x="0" y={23 + i * 29} fill="#45657a" font-size="10">{point.label.slice(0, 19)}</text><rect x="130" y={10 + i * 29} width={Math.max(1, Math.abs(point.value) / maximum * 195)} height="18" rx="3" fill={point.value < 0 ? '#bd7958' : '#237e95'}/><text x="415" y={23 + i * 29} text-anchor="end" fill="#274e63" font-size="10">{displayValue(point.value)}</text></g>)}
    <text x="130" y={height - 5} fill="#5b7484" font-size="9">{(graph.yLabel ?? 'Value').slice(0, 24)} · bar length represents magnitude</text>
  </svg><details><summary class="ja-note">View data values</summary><table class="ja-chart-table"><thead><tr><th>{graph.xLabel ?? 'Label'}</th><th>{graph.yLabel ?? 'Value'}</th></tr></thead><tbody>{points.map((point, i) => <tr key={i}><td>{point.label}</td><td>{point.value}</td></tr>)}</tbody></table></details></figure>;
}
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename(title: string): string { return title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'gradient-study-packet'; }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function packetMarkdown(packet: StudyPacket): string {
  return `# ${packet.title}\n\n${packet.summary}\n\n${packet.markdown}${packet.sampleMarkdown ? `\n\n## Sample assignment\n\nAI-generated reference sample. Review, verify, and follow your course policy before using it.\n\n${packet.sampleMarkdown}` : ''}\n\n${packet.diagrams.map(diagram => `## ${diagram.title}\n\n${diagram.nodes.map(node => `- ${node.id}: ${node.label}`).join('\n')}\n${diagram.edges.map(edge => `- ${edge.from} -> ${edge.to}${edge.label ? `: ${edge.label}` : ''}`).join('\n')}`).join('\n\n')}\n\n${packet.graphs.map(graph => `## ${graph.title}\n\n| Label | Value |\n| --- | ---: |\n${graph.points.map(point => `| ${point.label.replace(/\|/g, '\\|')} | ${point.value} |`).join('\n')}`).join('\n\n')}\n\n${packet.images.filter(image => safeUrl(image.url) && safeUrl(image.sourceUrl)).map(image => `![${image.alt.replace(/[\[\]]/g, '')}](${safeUrl(image.url)})\n[Image source](${safeUrl(image.sourceUrl)})`).join('\n\n')}\n\n## Sources\n\n${packet.sources.filter(source => safeUrl(source.url)).map(source => `- [${source.title.replace(/[\[\]]/g, '')}](${safeUrl(source.url)})${source.excerpt ? `: ${source.excerpt}` : ''}`).join('\n')}${packet.warnings.length ? `\n\n## Notes to verify\n\n${packet.warnings.map(warning => `- ${warning}`).join('\n')}` : ''}\n`;
}
function assignmentBrief(assignment: CanvasLiveAssignment | undefined): string { return assignment ? plain(assignment.descriptionHtml) : ''; }

export interface AssistantViewProps { snapshot: CanvasSnapshot; preview?: boolean; initialCourseId?: string; initialAssignmentId?: string }
export function AssistantView({ snapshot, preview = false, initialCourseId, initialAssignmentId }: AssistantViewProps) {
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
    setGenerating(true); setGenerationError('');
    try {
      const preferences = `Visual preferences: ${visuals.diagrams ? 'include clean concept diagrams when helpful' : 'omit diagrams'}; ${visuals.graphs ? 'include graphs only when numerical data is available and label illustrative examples' : 'omit graphs'}; ${visuals.images ? 'include only relevant, attributed images from retrieved resources when available' : 'omit images'}. Never invent sources, measurements, or image URLs.`;
      const result = await generateStudyPacket(settings, {
        course: { id: course.id, name: course.name, code: course.code },
        assignment: { id: assignment.id, title: assignment.name, description: brief, url: assignment.htmlUrl, dueAt: assignment.dueAt ?? null, rubric: assignment.rubric?.map(criterion => `${plain(criterion.description)} (${criterion.points} points): ${criterion.ratings.map(rating => plain(rating.description)).join('; ')}`).join('\n') },
        prompt: `${prompt.trim()}\n\n${preferences}`, level: settings.detailLevel, mode, model: settings.reasoningModel, webResearch: settings.webResearch,
        resources: resources.map(resource => ({ title: resource.title, url: resource.url })),
      });
      if (mounted.current) setPacket({ ...result, diagrams: visuals.diagrams ? result.diagrams : [], graphs: visuals.graphs ? result.graphs : [], images: visuals.images ? result.images : [] });
    } catch (error) { if (mounted.current) setGenerationError(errorMessage(error)); } finally { if (mounted.current) setGenerating(false); }
  };
  const inspectPage = async () => {
    setBrowserBusy(true); setBrowserError(''); setActionMessage('');
    try { const context = await captureBrowserContext(); const plan = await planBrowserAction(settings, { ...context, goal: browserGoal, model: settings.visionModel }); if (mounted.current) setBrowserPlan(plan); }
    catch (error) { if (mounted.current) setBrowserError(errorMessage(error)); } finally { if (mounted.current) setBrowserBusy(false); }
  };
  const exportHtml = () => {
    if (!packet || !resultRef.current) return;
    download(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(packet.title)}</title><style>body{margin:0;background:#e8eef4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:30px 15px}main{max-width:850px;margin:auto}${ASSISTANT_STYLES}.ja{border:0}.ja-result{border:0}.ja-result-header{padding:30px}.ja-result-body{padding:30px}@media print{body{background:white;padding:0}.ja{border:0}.ja-result{overflow:visible}.ja-result-header,.ja-result-body{padding:15px}.ja-visual{break-inside:avoid}a{overflow-wrap:anywhere}}</style></head><body><main class="ja"><article class="ja-result">${resultRef.current.innerHTML}</article></main></body></html>`, `${filename(packet.title)}.html`, 'text/html;charset=utf-8');
  };

  return <><style>{ASSISTANT_STYLES}</style><section class="ja" aria-label="Local AI study assistant">
    <header class="ja-head"><div class="ja-core" aria-hidden="true"><span><Icon name="spark" size={19}/></span></div><div><div class="ja-eyebrow">Your local intelligence</div><h1>Consider it handled.</h1><p>Research. Understand. Create. Stay ahead.</p></div><span class="ja-status"><i class={`ja-led ${ready ? 'ready' : ''}`}/>{checking ? 'Connecting' : ready ? 'Local AI ready' : 'Setup needed'}</span></header>
    <div class="ja-inner">
      {preview && <div class="ja-notice warning">Canvas is showing sample courses. AI requests use the local models you connect below.</div>}
      <details class="ja-settings" open={!ready}><summary><Icon name="settings" size={14}/>Local model connection</summary><div class="ja-fields">
        <label><span class="ja-label">Local assistant service</span><input class="ja-control" aria-label="Local assistant service URL" type="url" value={settings.backendUrl} disabled={generating} onChange={e => updateSettings({ backendUrl: e.currentTarget.value })} placeholder="http://127.0.0.1:8765"/></label>
        <div><label class="ja-label" for="ja-reasoning-model">Reasoning model · installed on your Mac</label><select id="ja-reasoning-model" class="ja-control" value={settings.reasoningModel} disabled={generating || checking || !reasoningModels.length} onChange={e => updateSettings({ reasoningModel: e.currentTarget.value })}>{reasoningModels.length ? reasoningModels.map(name => <option key={name} value={name}>{modelLabel(name, health)}{health?.recommended?.reasoningModel === name ? ' · Recommended' : ''}</option>) : <option value="">Connect Ollama to discover your installed models</option>}</select></div>
        <div><label class="ja-label" for="ja-vision-model">Vision & browser companion · installed</label><select id="ja-vision-model" class="ja-control" value={settings.visionModel} disabled={browserBusy || checking || !visionModels.length} onChange={e => updateSettings({ visionModel: e.currentTarget.value })}>{visionModels.length ? visionModels.map(name => <option key={name} value={name}>{modelLabel(name, health)}{health?.recommended?.visionModel === name ? ' · Recommended' : ''}</option>) : <option value="">No installed vision model detected</option>}</select></div>
        <button class="ja-btn" disabled={checking} onClick={checkConnection}><Icon name="refresh" size={13} className={checking ? 'g-spinner' : ''}/>{checking ? 'Checking local services…' : 'Check connection'}</button>
        {health && <p class="ja-note">{health.ollamaConnected ? `Ollama connected · ${health.models.length} installed model${health.models.length === 1 ? '' : 's'}` : health.message ?? 'Start Ollama, then check again.'}</p>}
        {(health?.recommended?.reason || health?.recommendationReason) && <div class="ja-notice"><strong>Recommended for this Mac:</strong> {health?.recommended?.reason ?? health?.recommendationReason}{health?.recommended?.contextLength ? ` · ${health.recommended.contextLength.toLocaleString()} token context` : ''}</div>}
        {health?.recommended && reasoningModels.includes(health.recommended.reasoningModel) && visionModels.includes(health.recommended.visionModel) && (settings.reasoningModel !== health.recommended.reasoningModel || settings.visionModel !== health.recommended.visionModel) && <button class="ja-btn" disabled={generating || browserBusy} onClick={() => updateSettings({ reasoningModel: health.recommended!.reasoningModel, visionModel: health.recommended!.visionModel })}><Icon name="bolt" size={13}/>Use recommended model pair</button>}
        {!ready && <div class="ja-setup"><strong>Connect your local engine</strong><p class="ja-note">Run this from the project folder after installing the backend dependencies, and keep Ollama running. Your existing models will appear here.</p><code>make assistant</code><p class="ja-note">Ollama listens on <code style={{ display: 'inline', padding: 0, background: 'transparent' }}>127.0.0.1:11434</code>. See gradient/docs/LOCAL_AI.md for setup and memory guidance.</p></div>}
        {connectionError && <div class="ja-notice error" role="alert">{connectionError}</div>}
      </div></details>

      <section class="ja-section"><div class="ja-row"><h2>What are we working on?</h2><Icon name="book" size={16}/></div><div class="ja-fields" style={{ marginTop: '11px' }}>
        <label><span class="ja-label">Course</span><select class="ja-control" aria-label="Assistant course" value={course?.id ?? ''} disabled={generating} onChange={e => { setCourseId(e.currentTarget.value); setAssignmentId(''); }}>{snapshot.courses.map(item => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span class="ja-label">Assignment or homework</span><select class="ja-control" aria-label="Assistant assignment" value={assignment?.id ?? ''} disabled={generating || !course?.assignments.length} onChange={e => setAssignmentId(e.currentTarget.value)}>{course?.assignments.length ? course.assignments.map(item => <option value={item.id} key={item.id}>{item.name}</option>) : <option value="">No assignments available</option>}</select></label>
      </div>{assignment && <div class="ja-context"><strong>{assignment.name}</strong><span>{assignment.dueAt && Number.isFinite(Date.parse(assignment.dueAt)) ? `Due ${new Date(assignment.dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ` : ''}{resources.length} course materials in context</span>{safeUrl(assignment.htmlUrl) && <div><a href={safeUrl(assignment.htmlUrl)} target="_blank" rel="noopener noreferrer">Open in Canvas <Icon name="external" size={10}/></a></div>}{brief && <details><summary>Read the assignment brief</summary><div class="ja-brief">{brief}</div></details>}</div>}</section>

      <section class="ja-section"><h2>How far should I go?</h2><div class="ja-detail" role="group" aria-label="Response detail level">{LEVELS.map(level => <button key={level.id} class={settings.detailLevel === level.id ? 'active' : ''} aria-pressed={settings.detailLevel === level.id} disabled={generating} onClick={() => updateSettings({ detailLevel: level.id })}><strong>{level.title}</strong><small>{level.description}</small></button>)}</div>
        <div class="ja-mode" role="group" aria-label="Assistant output type"><button class={`ja-btn ${mode === 'explain' ? 'active' : ''}`} aria-pressed={mode === 'explain'} disabled={generating} onClick={() => setMode('explain')}><Icon name="layers" size={12}/>Study & understand</button><button class={`ja-btn ${mode === 'sample' ? 'active' : ''}`} aria-pressed={mode === 'sample'} disabled={generating} onClick={() => setMode('sample')}><Icon name="file" size={12}/>Sample assignment</button></div>
        {mode === 'sample' && <p class="ja-note">A complete reference draft, clearly marked as an AI-generated sample. Verify it and follow your course’s AI policy.</p>}
        <div class="ja-switches"><label class="ja-switch"><input type="checkbox" checked={settings.webResearch} disabled={generating} onChange={e => updateSettings({ webResearch: e.currentTarget.checked })}/>Research the web</label>{(['diagrams', 'graphs', 'images'] as const).map(key => <label class="ja-switch" key={key}><input type="checkbox" checked={visuals[key]} disabled={generating} onChange={e => setVisuals({ ...visuals, [key]: e.currentTarget.checked })}/>{key[0]?.toUpperCase()}{key.slice(1)}</label>)}</div>
      </section>
      <section class="ja-section"><button class="ja-btn" style={{marginBottom:'12px',marginRight:'8px'}} onClick={async()=>{try { const granted=await enableBrowserSearch(); setGenerationError(granted?'': 'Google access was not enabled.'); } catch(error){setGenerationError(errorMessage(error));}}}>Enable Google browser search</button><a class="ja-btn" style={{marginBottom: '12px'}} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent(`${assignment?.name ?? ''} ${prompt.trim()} tutorial explanation`.slice(0, 250))}`}>Open Google search <Icon name="external" size={12}/></a><label class="ja-label" for="ja-prompt">Anything you want me to focus on?</label><textarea id="ja-prompt" class="ja-control" rows={3} value={prompt} disabled={generating} onInput={e => setPrompt(e.currentTarget.value)} placeholder="Explain the hard parts, compare approaches, or write a sample with diagrams and references…"/>
        <button class="ja-btn primary full" style={{ marginTop: '11px' }} disabled={!ready || !assignment || generating} onClick={generate}>{generating ? <><Icon name="refresh" size={15} className="g-spinner"/>Working on your request…</> : <><Icon name="spark" size={15}/>{mode === 'sample' ? 'Create my sample assignment' : 'Build my study packet'}<Icon name="arrow" size={14}/></>}</button>
        {generating && <div class="ja-progress" role="status"><span>Reading Canvas materials, researching, then drafting with {settings.reasoningModel}. This can take several minutes.</span></div>}
        {generationError && <div class="ja-notice error" role="alert" style={{ marginTop: '10px' }}>{generationError}</div>}
        <p class="ja-note" style={{ marginTop: '9px' }}>Coursework is sent to the local service on your computer. Web research sends search queries to public search engines. Generated work stays in this tab until you export it.</p>
      </section>

      {packet && <section aria-label="Generated study packet"><div class="ja-row" style={{ marginBottom: '10px' }}><h2>Your study packet</h2><span class="ja-eyebrow">Ready for review</span></div><article class="ja-result" ref={resultRef}><header class="ja-result-header"><div class="ja-eyebrow">Gradient · AI-generated study reference</div><h2>{packet.title}</h2><p>{packet.summary}</p>{packet.generatedAt && <p>Created {new Date(packet.generatedAt).toLocaleString()}</p>}</header><div class="ja-result-body"><AssistantMarkdown text={packet.markdown}/>{packet.diagrams.map((diagram, i) => <ConceptDiagram key={i} diagram={diagram}/>)}{packet.graphs.map((graph, i) => <DataGraph key={i} graph={graph}/>)}{packet.images.filter(image => safeUrl(image.url) && safeUrl(image.sourceUrl)).map((image, i) => <figure class="ja-visual" key={i}><figcaption>{image.title}</figcaption><img src={safeUrl(image.url)} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }}/><a href={safeUrl(image.sourceUrl)} target="_blank" rel="noopener noreferrer">View image source</a></figure>)}{packet.sampleMarkdown && <section class="ja-sample"><span class="ja-sample-tag">AI-GENERATED SAMPLE · REVIEW BEFORE USE</span><AssistantMarkdown text={packet.sampleMarkdown}/></section>}{!!packet.checklist?.length && <section class="ja-sample"><h3>Before you finish</h3><ul class="ja-checklist">{packet.checklist.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}{packet.warnings.map((warning, i) => <p class="ja-note" key={i} style={{ marginTop: '10px' }}><strong>Verify:</strong> {warning}</p>)}<section class="ja-sources"><h3>Sources & further reading</h3>{packet.sources.length ? <ol>{packet.sources.map((source, i) => <li key={source.id || i}>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : <strong>{source.title}</strong>}{source.kind && <small> · {source.kind === 'canvas' ? 'Course material' : 'Web resource'}</small>}{source.excerpt && <p>{source.excerpt}</p>}</li>)}</ol> : <p class="ja-note">No verified external sources were returned. Check claims against your course materials.</p>}</section></div></article><div class="ja-export"><button class="ja-btn" onClick={exportHtml}><Icon name="download" size={13}/>Export illustrated HTML</button><button class="ja-btn" onClick={() => download(packetMarkdown(packet), `${filename(packet.title)}.md`, 'text/markdown;charset=utf-8')}><Icon name="download" size={13}/>Markdown</button></div><p class="ja-note">Open the HTML in your browser to print or save it as a PDF, with diagrams and references.</p></section>}

      <section class="ja-browser"><div class="ja-row"><h2>Eyes on your browser</h2><Icon name="search" size={16}/></div><p class="ja-note">Your local vision model reads a screenshot and page text, then suggests a sequence of browsing steps. You choose each step.</p><label style={{ display: 'block', marginTop: '10px' }}><span class="ja-label">What should the vision model look for?</span><textarea class="ja-control" aria-label="Browser companion goal" rows={2} value={browserGoal} disabled={browserBusy} onInput={e => setBrowserGoal(e.currentTarget.value)}/></label><button class="ja-btn full" style={{ marginTop: '9px' }} disabled={!visionReady || browserBusy || !browserGoal.trim()} onClick={inspectPage}><Icon name={browserBusy ? 'refresh' : 'search'} size={14} className={browserBusy ? 'g-spinner' : ''}/>{browserBusy ? `Inspecting with ${settings.visionModel}…` : 'Inspect this Canvas page'}</button>{!visionReady && <p class="ja-note">Connect Ollama and select an installed model with vision support to enable page inspection.</p>}{browserError && <div class="ja-notice error" role="alert" style={{ marginTop: '9px' }}>{browserError}</div>}{browserPlan && <div style={{ marginTop: '12px' }}><p class="ja-note">{browserPlan.summary}</p><ol class="ja-browser-steps">{browserPlan.actions.map((action, i) => <li key={i}><strong>{i + 1}. {action.kind === 'open' ? 'Open a resource' : action.kind === 'find' ? 'Find on this page' : action.kind === 'scroll' ? 'Move through the page' : 'Read this section'}</strong><p>{action.description}</p><button class="ja-btn" onClick={async () => { try { await applyBrowserAction(action); setActionMessage(`Step ${i + 1}: ${action.description}`); } catch (error) { setBrowserError(errorMessage(error)); } }}>{action.kind === 'open' ? 'Open link' : action.kind === 'find' ? 'Find text' : action.kind === 'scroll' ? 'Scroll' : 'Show section'}<Icon name="arrow" size={11}/></button></li>)}</ol>{browserPlan.warnings.map((warning, i) => <p class="ja-note" key={i}>{warning}</p>)}</div>}{actionMessage && <p class="ja-note" role="status">{actionMessage}</p>}</section>
      <div class="ja-footnote"><Icon name="shield" size={12}/><span>Local models. Your Canvas access. References you can inspect. The assistant does not submit assignments.</span></div>
    </div>
  </section></>;
}
