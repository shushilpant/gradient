import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AssistantSettings } from '../assistantTypes.js';
import { loadAssistantSettings } from '../assistantClient.js';
import { getComputerConfig, startComputerSession, getComputerSession, cancelComputerSession } from '../computerClient.js';
import type { ComputerConfig, ComputerSession } from '../computerTypes.js';
import { GroundedMarkdown } from './AssistantView.js';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { ComputedVisuals, WorkEvidence } from './WorkEvidence.js';
import { ASSISTANT_STYLES } from './assistantStyles.js';
import { Icon } from './Icons.js';
import { WORKFLOW_STYLES } from './workflowStyles.js';

export type WorkflowMode = 'manual' | 'auto';

export function WorkflowModeChoice({onChoose}:{onChoose:(mode:WorkflowMode)=>void}) {
  return <section class="wf-choice" aria-label="Choose how to work">
    <style>{WORKFLOW_STYLES}</style>
    <h1>Let's <span>go.</span></h1>
    <div class="wf-options">
      <button class="wf-option auto" aria-label="Use auto mode" onClick={()=>onChoose('auto')}><span class="wf-option-icon"><Icon name="bolt" size={28}/></span><span class="wf-option-text"><strong>Auto</strong><span>Draft the next homework.</span></span><span class="wf-option-go"><Icon name="arrow" size={22}/></span></button>
      <button class="wf-option" aria-label="Use manual mode" onClick={()=>onChoose('manual')}><span class="wf-option-icon"><Icon name="grid" size={26}/></span><span class="wf-option-text"><strong>Manual</strong><span>Courses, grades, assistant.</span></span><span class="wf-option-go"><Icon name="arrow" size={22}/></span></button>
    </div>
  </section>;
}

const DEFAULTS:AssistantSettings={backendUrl:'http://127.0.0.1:8765',reasoningModel:'gpt-oss:20b',visionModel:'gemma4:e4b',detailLevel:'all_in',webResearch:true};
function message(error:unknown) { return error instanceof Error?error.message:'The local browser agent could not complete this operation.'; }
function screenshotUrl(value:string|undefined):string|undefined {
  return value && value.length<8000000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)?value:undefined;
}
function download(content:string,name:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function escape(value:string) {return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

export function AutoWorkflow({snapshot,preview=false}:{snapshot?:CanvasSnapshot;preview?:boolean}) {
  const scope=snapshot?`${snapshot.origin}|${snapshot.user.id}`:'local-sandbox';
  const [approved,setApproved]=useState(false);
  const [settings,setSettings]=useState<AssistantSettings>(DEFAULTS);
  const [config,setConfig]=useState<ComputerConfig|null>(null);
  const [checking,setChecking]=useState(true);
  const [starting,setStarting]=useState(false);
  const [stopping,setStopping]=useState(false);
  const [error,setError]=useState('');
  const [goal,setGoal]=useState('Find the next homework in the local Canvas course, read its instructions and available rubric and supporting materials, then prepare a clearly labelled reference sample. Report missing requirements and uncertainties.');
  const [session,setSession]=useState<ComputerSession|null>(null);
  const mounted=useRef(true);
  const requestVersion=useRef(0);
  const currentRun=useRef<{settings:AssistantSettings;session:ComputerSession}|null>(null);
  const currentScope=useRef(scope);currentScope.current=scope;
  const acceptSession=(response:ComputerSession,usedSettings:AssistantSettings)=>{
    currentRun.current={settings:usedSettings,session:response};setSession(response);
  };
  const result=useRef<HTMLElement>(null);
  const activity=useRef<HTMLElement>(null);
  useEffect(()=>{if(session?.id)activity.current?.scrollIntoView({block:'start',behavior:'smooth'});},[session?.id]);
  const active=session?.status==='running';
  const cancelling=stopping||session?.stage==='cancelling';
  useEffect(()=>{
    mounted.current=true;const version=++requestVersion.current;
    void loadAssistantSettings().then(async saved=>{
      if(!mounted.current||version!==requestVersion.current)return;setSettings(saved);
      try {const response=await getComputerConfig(saved);if(mounted.current&&version===requestVersion.current)setConfig(response);}
      catch(reason){if(mounted.current&&version===requestVersion.current)setError(message(reason));}
      finally{if(mounted.current&&version===requestVersion.current)setChecking(false);}
    }).catch(reason=>{if(mounted.current&&version===requestVersion.current){setError(message(reason));setChecking(false);}});
    return()=>{
      mounted.current=false;requestVersion.current++;
      const run=currentRun.current;currentRun.current=null;
      // Account changes unmount the scoped workspace. Never leave its agent running.
      if(run?.session.status==='running')void cancelComputerSession(run.settings,run.session.id).catch(()=>{});
    };
  },[scope]);
  useEffect(()=>{
    if(!session?.id || session.status!=='running')return;
    let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      try{const response=await getComputerSession(settings,session.id);if(!stopped&&mounted.current&&currentRun.current?.session.id===response.id){acceptSession(response,settings);setError('');}}
      catch(reason){if(!stopped&&mounted.current)setError(message(reason));}
      if(!stopped)timer=setTimeout(poll,2000);
    };
    void poll();return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[session?.id,session?.status,settings.backendUrl]);
  const refresh=async()=>{
    const version=++requestVersion.current;setChecking(true);setError('');
    try{
      const saved=await loadAssistantSettings();const response=await getComputerConfig(saved);
      if(mounted.current&&version===requestVersion.current){setSettings(saved);setConfig(response);setApproved(false);}
    }catch(reason){if(mounted.current&&version===requestVersion.current)setError(message(reason));}
    finally{if(mounted.current&&version===requestVersion.current)setChecking(false);}
  };
  const start=async()=>{
    if(!config?.available||!approved||starting||active)return;
    const version=++requestVersion.current;const startedScope=scope;
    setStarting(true);setError('');
    try{
      const response=await startComputerSession(settings,{origin:config.sandboxOrigin,goal:goal.trim(),reasoningModel:settings.reasoningModel,visionModel:settings.visionModel,webResearch:settings.webResearch});
      if(!mounted.current||version!==requestVersion.current||currentScope.current!==startedScope){
        void cancelComputerSession(settings,response.id).catch(()=>{});return;
      }
      acceptSession(response,settings);setApproved(false);
    }catch(reason){if(mounted.current&&version===requestVersion.current)setError(message(reason));}
    finally{if(mounted.current&&version===requestVersion.current)setStarting(false);}
  };
  const stop=async()=>{
    if(!session || !active || cancelling)return;
    const id=session.id;setStopping(true);setError('');
    try{
      const response=await cancelComputerSession(settings,id);
      if(mounted.current&&currentRun.current?.session.id===id)acceptSession(response,settings);
    }catch(reason){if(mounted.current)setError(message(reason));}
    finally{if(mounted.current)setStopping(false);}
  };
  const exportHtml=()=>{
    if(!session?.packet||!result.current)return;
    const title=escape(session.packet.title);
    download(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${ASSISTANT_STYLES}${WORKFLOW_STYLES}body{margin:0;padding:32px;background:#faf8f5}main{max-width:850px;margin:auto}@media print{body{padding:0;background:white}.ja-rendered-visual{break-inside:avoid}}</style></head><body><main class="ja">${result.current.innerHTML}</main></body></html>`,'gradient-auto-reference.html','text/html;charset=utf-8');
  };
  const latestScreenshot=[...(session?.steps??[])].reverse().find(step=>screenshotUrl(step.screenshot));
  return <section class="wf-auto" aria-label="Automatic sandbox workflow"><style>{WORKFLOW_STYLES + ASSISTANT_STYLES}</style>
    <header class="wf-auto-head"><h1>Sandbox workflows</h1></header>
    <div class="g-notice"><strong>{preview?'Synthetic demonstration context':'Local Canvas replica only'}</strong><p>The browser agent reads the configured sandbox in an isolated browser. It cannot submit coursework, complete assessments, or navigate your live Canvas account. Staged live coursework remains a local copy and is not synthetic.</p></div>
    <div class="wf-runtime"><span class={`wf-runtime-dot ${config?.available?'ready':''}`}/><strong>{checking?'Checking':config?.available?'Ready':'Needs setup'}</strong><button class="wf-text-button" disabled={checking||starting||active} onClick={refresh}>Recheck</button></div>
    {config?.message && !config.available && <div class="g-notice">{config.message}</div>}
    <div class="wf-target"><strong>{config?.sandboxOrigin||'Waiting for local Canvas'}</strong><p class="g-small">Workflow: inspect homework, gather resources, prepare reference material.<br/>Reasoning: {settings.reasoningModel} · Vision: {settings.visionModel}<br/>Choose installed models in AI Workspace → Models, then Recheck here.</p></div>
    {snapshot&&<label class="wf-field"><span>Use synced coursework as a target</span><select aria-label="Workflow coursework" disabled={starting||active} onChange={event=>{
      const [courseId,assignmentId]=event.currentTarget.value.split(':');const course=snapshot.courses.find(item=>item.id===courseId);const assignment=course?.assignments.find(item=>item.id===assignmentId);
      setApproved(false);if(course&&assignment)setGoal(`Find ${assignment.name} in ${course.code || course.name} in the local Canvas replica. Read its instructions, rubric and relevant course resources. Prepare clearly labelled reference learning material, review requirement coverage, and report unresolved gaps. Do not complete or submit an assessment.`);
    }}><option value="">Choose a course assignment (optional)</option>{snapshot.courses.map(course=><optgroup label={course.code || course.name} key={course.id}>{course.assignments.map(assignment=><option key={assignment.id} disabled={!!homeworkAutopilotBlock(assignment)} value={`${course.id}:${assignment.id}`}>{assignment.name}{homeworkAutopilotBlock(assignment) ? ' (unavailable for automation)' : ''}</option>)}</optgroup>)}</select><span class="g-small">The corresponding coursework must be seeded or imported into the local replica before running.</span></label>}
    <label class="wf-field"><span>Goal</span><textarea aria-label="Automatic workflow goal" rows={3} value={goal} disabled={starting||active} onInput={event=>{setGoal(event.currentTarget.value);setApproved(false);}}/></label>
    <label class="ja-switch"><input type="checkbox" checked={settings.webResearch} disabled={starting||active} onChange={event=>{setSettings({...settings,webResearch:event.currentTarget.checked});setApproved(false);}}/>Allow optional public web research for supporting concepts</label>
    <label class="ja-switch"><input type="checkbox" checked={approved} disabled={checking||starting||active} onChange={event=>setApproved(event.currentTarget.checked)}/>I approve this read-only workflow in the local sandbox shown above.</label>
    <div class="wf-actions"><button class="g-primary" disabled={checking||!config?.available||!approved||starting||active||goal.trim().length<10} onClick={start}><Icon name="bolt" size={18}/>{starting?'Starting…':'Start automatic workflow'}</button>{active&&<button class="g-secondary" disabled={cancelling} onClick={()=>stop()}>{cancelling?'Stopping after current local call…':'Stop run'}</button>}</div>
    {error&&<div class="g-notice" role="alert">{error}</div>}
    {session&&<section class="wf-session" ref={activity} aria-label="Browser agent activity"><div class="wf-session-heading"><h2>{session.status==='complete'?'Reference sample ready':session.status==='cancelled'?'Run stopped':session.status==='error'?'Run needs attention':'Agent at work'}</h2><span class={`wf-state ${session.status}`}>{session.status}</span></div><p class="wf-session-label" role="status" aria-live="polite">{session.label||session.stage}</p>{session.error&&<div class="g-notice" role="alert">{session.error}</div>}
      <section class="wf-browser-preview" aria-label="Agent Canvas view"><strong>{active?'On Canvas':'Last view'}</strong>{latestScreenshot?<><img src={screenshotUrl(latestScreenshot.screenshot)} alt="Current agent Canvas page"/><p>{latestScreenshot.url}</p></>:<p>Opening Canvas…</p>}</section>
      <ol class="wf-step-list">{session.steps.map((step,index)=><li key={`${step.number}-${index}`}><span class="wf-step-number">{String(step.number).padStart(2,'0')}</span><div><strong>{step.action==='open'?'Open resource':step.action==='observe'?'Inspect page':step.action==='read'?'Read instructions':step.action==='scroll'?'Explore page':'Prepare sample'}</strong><p>{step.reason}</p><small>{step.url}</small></div></li>)}</ol>
    </section>}
    {session?.packet&&<section class="ja wf-result" aria-label="Automatic reference sample"><article class="ja-result" ref={result}><header class="ja-result-header"><h2>{session.packet.title}</h2><p>{session.packet.summary}</p></header><div class="ja-result-body"><GroundedMarkdown text={session.packet.markdown} sources={session.packet.sources}/><ComputedVisuals packet={session.packet}/><WorkEvidence packet={session.packet}/>{session.packet.sampleMarkdown&&<section class="ja-sample"><h3>AI-generated reference material</h3><p class="ja-note">Review the sources and your course’s assistance policy. This is reference material for learning.</p><GroundedMarkdown text={session.packet.sampleMarkdown} sources={session.packet.sources}/></section>}{session.packet.warnings.map((warning,index)=><p class="ja-note" key={index}>{warning}</p>)}<section class="ja-sources"><h3>Sources</h3><ol>{session.packet.sources.map(source=><li key={source.id}><strong>{source.title}</strong><p>{source.url}</p>{source.excerpt&&<blockquote>{source.excerpt}</blockquote>}</li>)}</ol></section></div></article><button class="g-secondary" onClick={exportHtml}><Icon name="download" size={16}/>Export illustrated sample</button></section>}
  </section>;
}
