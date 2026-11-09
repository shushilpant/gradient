import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AssistantHealth, AssistantSettings } from '../assistantTypes.js';
import { getAssistantHealth, loadAssistantSettings } from '../assistantClient.js';
import { canAutomateCurrentPage, getPageAutomation, stopPageAutomation, subscribePageAutomation } from '../pageAutomation.js';
import { startPageAutopilot } from '../pageAutopilot.js';
import { getPageDemoTarget, startPageDemo } from '../pageDemo.js';
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
function download(content:string,name:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function escape(value:string) {return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

export function AutoWorkflow({snapshot,preview=false}:{snapshot?:CanvasSnapshot;preview?:boolean}) {
  const [approved,setApproved]=useState(false);
  const [settings,setSettings]=useState<AssistantSettings>(DEFAULTS);
  const [health,setHealth]=useState<AssistantHealth|null>(null);
  const [checking,setChecking]=useState(false);
  const [error,setError]=useState('');
  const [healthError,setHealthError]=useState('');
  const [selection,setSelection]=useState('');
  const [goal,setGoal]=useState('Find the next homework, read its instructions and supporting materials, and prepare a reference assignment.');
  const [session,setSession]=useState(getPageAutomation);
  const mounted=useRef(true);
  const requestVersion=useRef(0);
  const result=useRef<HTMLElement>(null);
  const activity=useRef<HTMLElement>(null);
  const active=session?.status==='running';
  const localCanvas=!preview&&canAutomateCurrentPage();
  const ready=localCanvas&&!!snapshot&&health?.ok&&health.ollamaConnected&&health.models.includes(settings.reasoningModel);
  const demoReady=localCanvas&&snapshot&&!!getPageDemoTarget(snapshot);
  const refresh=async()=>{
    const version=++requestVersion.current;setChecking(true);setHealthError('');setHealth(null);
    try{
      const saved=await loadAssistantSettings();
      const response=await getAssistantHealth(saved);
      if(mounted.current&&version===requestVersion.current){setSettings(saved);setHealth(response);setApproved(false);}
    }catch(reason){if(mounted.current&&version===requestVersion.current)setHealthError(message(reason));}
    finally{if(mounted.current&&version===requestVersion.current)setChecking(false);}
  };
  useEffect(()=>{
    mounted.current=true;
    const unsubscribe=subscribePageAutomation(setSession);
    if(localCanvas&&!getPageAutomation()?.demo)void refresh();
    return()=>{mounted.current=false;requestVersion.current++;unsubscribe();};
  },[localCanvas,snapshot?.user.id]);
  useEffect(()=>{if(session?.status==='complete')activity.current?.scrollIntoView({block:'start',behavior:'smooth'});},[session?.id,session?.status]);
  const start=(kind:'workflow'|'demo')=>{
    if(active||!localCanvas)return;
    if(kind==='demo' ? !demoReady : !ready||!approved||goal.trim().length<10)return;
    setError('');
    try{
      if(kind==='demo'&&snapshot)startPageDemo(snapshot);
      else {
        const [courseId,assignmentId]=selection.split(':');
        startPageAutopilot(goal.trim(),settings,courseId&&assignmentId?{courseId,assignmentId}:undefined,snapshot?.user.id);
      }
      setApproved(false);
    }catch(reason){setError(message(reason));}
  };
  const exportHtml=()=>{
    if(!session?.packet||!result.current)return;
    const title=escape(session.packet.title);
    download(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${ASSISTANT_STYLES}${WORKFLOW_STYLES}body{margin:0;padding:32px;background:#faf8f1}main{max-width:850px;margin:auto}@media print{body{padding:0;background:white}.ja-rendered-visual{break-inside:avoid}}</style></head><body><main class="ja">${result.current.innerHTML}</main></body></html>`,'gradient-auto-reference.html','text/html;charset=utf-8');
  };
  return <section class="wf-auto" aria-label="Automatic sandbox workflow"><style>{WORKFLOW_STYLES + ASSISTANT_STYLES}</style>
    <header class="wf-auto-head"><h1>Sandbox workflows</h1></header>
    <div class="g-notice"><strong>Local Canvas</strong><p>{localCanvas?'Automation runs in this Canvas tab using your existing session. It reads coursework and does not submit assignments.':'Open your signed-in local Canvas tab to run automation there.'}</p></div>
    {localCanvas&&<><div class="wf-runtime"><span class={`wf-runtime-dot ${ready?'ready':''}`}/><strong>{checking?'Checking models…':ready?'Ready':'Live models unavailable'}</strong><button class="wf-text-button" disabled={checking||active} onClick={refresh}>Recheck</button></div>
    <div class="wf-target"><strong>{location.origin}</strong><p class="g-small">Live reasoning: {settings.reasoningModel} · Vision: {settings.visionModel}<br/>Choose installed models in AI Workspace → Models, then Recheck here.</p>{healthError&&!session?.demo&&<p class="g-small">{healthError}</p>}</div></>}
    {snapshot&&<label class="wf-field"><span>Use synced coursework as a target</span><select aria-label="Workflow coursework" value={selection} disabled={!localCanvas||active} onChange={event=>{
      setSelection(event.currentTarget.value);
      const [courseId,assignmentId]=event.currentTarget.value.split(':');const course=snapshot.courses.find(item=>item.id===courseId);const assignment=course?.assignments.find(item=>item.id===assignmentId);
      setApproved(false);if(course&&assignment)setGoal(`Find ${assignment.name} in ${course.code || course.name} in this Canvas tab. Read its instructions, rubric and relevant course resources. Prepare clearly labelled reference learning material, review requirement coverage, and report unresolved gaps. Do not complete or submit an assessment.`);
    }}><option value="">Choose a course assignment (optional)</option>{snapshot.courses.map(course=><optgroup label={course.code || course.name} key={course.id}>{course.assignments.map(assignment=><option key={assignment.id} disabled={!!homeworkAutopilotBlock(assignment)} value={`${course.id}:${assignment.id}`}>{assignment.name}{homeworkAutopilotBlock(assignment) ? ' (unavailable for automation)' : ''}</option>)}</optgroup>)}</select><span class="g-small">Choose homework available in this Canvas tab.</span></label>}
    <label class="wf-field"><span>Goal</span><textarea aria-label="Automatic workflow goal" rows={3} value={goal} disabled={!localCanvas||active} onInput={event=>{setGoal(event.currentTarget.value);setApproved(false);}}/></label>
    <label class="ja-switch"><input type="checkbox" checked={settings.webResearch} disabled={!localCanvas||active} onChange={event=>{setSettings({...settings,webResearch:event.currentTarget.checked});setApproved(false);}}/>Allow optional public web research for supporting concepts</label>
    <label class="ja-switch"><input type="checkbox" checked={approved} disabled={!localCanvas||checking||active} onChange={event=>setApproved(event.currentTarget.checked)}/>I approve this read-only workflow in the local sandbox shown above.</label>
    <div class="wf-actions">
      <button class="g-primary" disabled={checking||!ready||!approved||active||goal.trim().length<10} onClick={()=>start('workflow')}><Icon name="bolt" size={18}/>Start automatic workflow</button>
      <button class="g-secondary" aria-describedby="wf-demo-description" disabled={!demoReady||active} onClick={()=>start('demo')}>Demo automation</button>
      <p class="g-small" id="wf-demo-description">Replay GRADIENT-SIGNALS in this tab and show the saved assignment. No model or web research is needed.{localCanvas&&!demoReady&&' Seed GRADIENT-SIGNALS to enable the replay.'}</p>
      {active&&<button class="g-secondary" onClick={stopPageAutomation}>Stop run</button>}
    </div>
    {error&&<div class="g-notice" role="alert">{error}</div>}
    {session&&<section class="wf-session" ref={activity} aria-label="Browser agent activity"><div class="wf-session-heading"><h2>{session.status==='complete'?(session.demo?'Saved demo result ready':'Reference sample ready'):session.status==='cancelled'?'Run stopped':session.status==='error'?'Run needs attention':session.demo?'Playing saved demo':'Agent at work'}</h2><span class={`wf-state ${session.status}`}>{session.status}</span></div><p class="wf-session-label" role="status" aria-live="polite">{session.label||session.stage}</p>{session.error&&<div class="g-notice" role="alert">{session.error}</div>}
      <p class="g-small">{active ? 'Automation is running in this Canvas tab.' : 'Canvas tab run finished.'}</p>
      <ol class="wf-step-list">{session.steps.map((step,index)=><li key={`${step.number}-${index}`}><span class="wf-step-number">{String(step.number).padStart(2,'0')}</span><div><strong>{step.action==='open'?'Open resource':step.action==='observe'?'Inspect page':step.action==='read'?'Read instructions':step.action==='scroll'?'Explore page':session.demo?'Show saved assignment':'Prepare sample'}</strong><p>{step.reason}</p><small>{step.url}</small></div></li>)}</ol>
    </section>}
    {session?.packet&&<section class="ja wf-result" aria-label="Automatic reference sample"><article class="ja-result" ref={result}><header class="ja-result-header"><h2>{session.packet.title}</h2><p>{session.packet.summary}</p></header><div class="ja-result-body"><GroundedMarkdown text={session.packet.markdown} sources={session.packet.sources}/><ComputedVisuals packet={session.packet}/><WorkEvidence packet={session.packet}/>{session.packet.sampleMarkdown&&<section class="ja-sample"><h3>{session.demo?'Saved reference assignment':'AI-generated reference material'}</h3>{!session.demo&&<p class="ja-note">Review the sources and your course’s assistance policy. This is reference material for learning.</p>}<GroundedMarkdown text={session.packet.sampleMarkdown} sources={session.packet.sources}/></section>}{session.packet.warnings.map((warning,index)=><p class="ja-note" key={index}>{warning}</p>)}<section class="ja-sources"><h3>Sources</h3><ol>{session.packet.sources.map(source=><li key={source.id}><strong>{source.title}</strong><p>{source.url}</p>{source.excerpt&&<blockquote>{source.excerpt}</blockquote>}</li>)}</ol></section></div></article><button class="g-secondary" onClick={exportHtml}><Icon name="download" size={16}/>Export illustrated sample</button></section>}
  </section>;
}
