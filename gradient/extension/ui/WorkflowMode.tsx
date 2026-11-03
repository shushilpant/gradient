import {startPageAutopilot} from '../pageAutopilot.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AssistantSettings } from '../assistantTypes.js';
import { loadAssistantSettings } from '../assistantClient.js';
import { getComputerConfig, getComputerSession, cancelComputerSession } from '../computerClient.js';
import type { ComputerConfig, ComputerSession } from '../computerTypes.js';
import { AssistantMarkdown } from './AssistantView.js';
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

export function AutoWorkflow() {
  const [settings,setSettings]=useState<AssistantSettings>(DEFAULTS);
  const [config,setConfig]=useState<ComputerConfig|null>(null);
  const [checking,setChecking]=useState(true);
  const [starting,setStarting]=useState(false);
  const [stopping,setStopping]=useState(false);
  const [error,setError]=useState('');
  const [goal,setGoal]=useState('Find the next homework in the local Canvas course, read its instructions and supporting materials, then prepare a complete reference sample with verified figures.');
  const [session,setSession]=useState<ComputerSession|null>(null);
  const mounted=useRef(true);
  const result=useRef<HTMLElement>(null);
  const activity=useRef<HTMLElement>(null);
  useEffect(()=>{if(session?.id)activity.current?.scrollIntoView({block:'start',behavior:'smooth'});},[session?.id]);
  const active=session?.status==='running';
  useEffect(()=>{
    mounted.current=true;
    void loadAssistantSettings().then(async saved=>{
      if(!mounted.current)return;setSettings(saved);
      try {const response=await getComputerConfig(saved);if(mounted.current)setConfig(response);}
      catch(reason){if(mounted.current)setError(message(reason));}
      finally{if(mounted.current)setChecking(false);}
    }).catch(reason=>{if(mounted.current){setError(message(reason));setChecking(false);}});
    return()=>{mounted.current=false;};
  },[]);
  useEffect(()=>{
    if(!session?.id || session.status!=='running')return;
    let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      try{const response=await getComputerSession(settings,session.id);if(!stopped&&mounted.current){setSession(response);setError('');}}
      catch(reason){if(!stopped&&mounted.current)setError(message(reason));}
      if(!stopped)timer=setTimeout(poll,2000);
    };
    void poll();return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[session?.id,session?.status,settings.backendUrl]);
  const refresh=async()=>{
    setChecking(true);setError('');
    try{const saved=await loadAssistantSettings();setSettings(saved);setConfig(await getComputerConfig(saved));}
    catch(reason){setError(message(reason));}finally{setChecking(false);}
  };
  const start=async()=>{
    if(!config?.available||starting||active)return;
    setStarting(true);setError('');
    try{
      if(location.origin===config.sandboxOrigin){startPageAutopilot(goal.trim());return;}
      throw new Error('Open local Canvas at http://127.0.0.1:8080 to run Auto in the main page.');

    }catch(reason){if(mounted.current)setError(message(reason));}finally{if(mounted.current)setStarting(false);}
  };
  const stop=async()=>{
    if(!session || !active)return;
    setStopping(true);setError('');
    try{await cancelComputerSession(settings,session.id);setSession(await getComputerSession(settings,session.id));}
    catch(reason){setError(message(reason));}finally{setStopping(false);}
  };
  const exportHtml=()=>{
    if(!session?.packet||!result.current)return;
    const title=escape(session.packet.title);
    download(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${ASSISTANT_STYLES}${WORKFLOW_STYLES}body{margin:0;padding:32px;background:#fff8f1}main{max-width:850px;margin:auto}@media print{body{padding:0;background:white}.ja-rendered-visual{break-inside:avoid}}</style></head><body><main class="ja">${result.current.innerHTML}</main></body></html>`,'gradient-auto-reference.html','text/html;charset=utf-8');
  };
  const latestScreenshot=[...(session?.steps??[])].reverse().find(step=>screenshotUrl(step.screenshot));
  return <section class="wf-auto" aria-label="Automatic sandbox workflow"><style>{WORKFLOW_STYLES + ASSISTANT_STYLES}</style>
    <header class="wf-auto-head"><h1>Auto</h1></header>
    <div class="wf-runtime"><span class={`wf-runtime-dot ${config?.available?'ready':''}`}/><strong>{checking?'Checking':config?.available?'Ready':'Needs setup'}</strong><button class="wf-text-button" disabled={checking||starting||active} onClick={refresh}>Recheck</button></div>
    {config?.message && !config.available && <div class="g-notice">{config.message}</div>}
    <div class="wf-target"><strong>{config?.sandboxOrigin||'Waiting for local Canvas'}</strong></div>
    <label class="wf-field"><span>Goal</span><textarea aria-label="Automatic workflow goal" rows={3} value={goal} disabled={starting||active} onInput={event=>setGoal(event.currentTarget.value)}/></label>
    <div class="wf-actions"><button class="g-primary" disabled={checking||!config?.available||starting||active||goal.trim().length<10} onClick={start}><Icon name="bolt" size={18}/>{starting?'Starting…':'Start automatic workflow'}</button>{active&&<button class="g-secondary" disabled={stopping} onClick={()=>stop()}>{stopping?'Stopping…':'Stop run'}</button>}</div>
    {error&&<div class="g-notice" role="alert">{error}</div>}
    {session&&<section class="wf-session" ref={activity} aria-label="Browser agent activity"><div class="wf-session-heading"><h2>{session.status==='complete'?'Reference sample ready':session.status==='cancelled'?'Run stopped':session.status==='error'?'Run needs attention':'Agent at work'}</h2><span class={`wf-state ${session.status}`}>{session.status}</span></div><p class="wf-session-label" role="status" aria-live="polite">{session.label||session.stage}</p>{session.error&&<div class="g-notice" role="alert">{session.error}</div>}
      <section class="wf-browser-preview" aria-label="Agent Canvas view"><strong>{active?'On Canvas':'Last view'}</strong>{latestScreenshot?<><img src={screenshotUrl(latestScreenshot.screenshot)} alt="Current agent Canvas page"/><p>{latestScreenshot.url}</p></>:<p>Opening Canvas…</p>}</section>
      <ol class="wf-step-list">{session.steps.map((step,index)=><li key={`${step.number}-${index}`}><span class="wf-step-number">{String(step.number).padStart(2,'0')}</span><div><strong>{step.action==='open'?'Open resource':step.action==='observe'?'Inspect page':step.action==='read'?'Read instructions':step.action==='scroll'?'Explore page':'Prepare sample'}</strong><p>{step.reason}</p><small>{step.url}</small></div></li>)}</ol>
    </section>}
    {session?.packet&&<section class="ja wf-result" aria-label="Automatic reference sample"><article class="ja-result" ref={result}><header class="ja-result-header"><h2>{session.packet.title}</h2><p>{session.packet.summary}</p></header><div class="ja-result-body"><AssistantMarkdown text={session.packet.markdown}/><ComputedVisuals packet={session.packet}/><WorkEvidence packet={session.packet}/>{session.packet.sampleMarkdown&&<section class="ja-sample"><AssistantMarkdown text={session.packet.sampleMarkdown}/></section>}{session.packet.warnings.map((warning,index)=><p class="ja-note" key={index}>{warning}</p>)}<section class="ja-sources"><h3>Sources</h3><ol>{session.packet.sources.map(source=><li key={source.id}><strong>{source.title}</strong><p>{source.url}</p></li>)}</ol></section></div></article><button class="g-secondary" onClick={exportHtml}><Icon name="download" size={16}/>Export illustrated sample</button></section>}
  </section>;
}
