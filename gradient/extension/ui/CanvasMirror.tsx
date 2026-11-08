import {useEffect,useRef,useState} from 'preact/hooks';
import type {CanvasSnapshot} from '../liveCanvas.js';
import {loadAssistantSettings} from '../assistantClient.js';
import {stageCanvasMirror} from '../computerClient.js';

export function CanvasMirror({snapshot}:{snapshot:CanvasSnapshot}) {
  const [approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<Awaited<ReturnType<typeof stageCanvasMirror>>|null>(null);
  const request=useRef<AbortController|null>(null);
  const scope=`${snapshot.origin}|${snapshot.user.id}`;
  const mounted=useRef(true);
  const live=snapshot.origin.startsWith('https:')&&snapshot.origin===location.origin;
  useEffect(()=>{
    mounted.current=true;setApproved(false);setError('');setResult(null);setBusy(false);
    return()=>{mounted.current=false;request.current?.abort();request.current=null;};
  },[scope]);
  const stage=async()=>{
    if(!approved||!live||busy)return;
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setResult(null);
    try{
      const settings=await loadAssistantSettings();controller.signal.throwIfAborted();
      const response=await stageCanvasMirror(settings,snapshot,controller.signal);
      if(mounted.current&&!controller.signal.aborted){setResult(response);setApproved(false);}
    }catch(reason){if(mounted.current&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'The local snapshot could not be staged.');}
    finally{if(mounted.current&&request.current===controller){request.current=null;setBusy(false);}}
  };
  return <section class="g-card" aria-label="Mirror student-visible Canvas courses">
    <div class="g-section-head"><h2>Local Canvas copy</h2></div>
    {live?<><p class="g-small">Copy this account’s visible courses, grades, assignment briefs and readable pages to the companion service on your computer. File links remain references. Your production Canvas records stay read-only. Applying the staged copy to the replica requires the separate import command shown after staging.</p>
    <label class="ja-switch"><input type="checkbox" checked={approved} disabled={busy} onChange={event=>setApproved(event.currentTarget.checked)}/>I approve copying my visible Canvas coursework to the local replica.</label>
    <button class="g-secondary" style={{marginTop:'12px'}} disabled={busy||!snapshot.courses.length||!approved} onClick={stage}>{busy?'Reading pages & staging courses…':'Stage my Canvas courses'}</button>
    {busy&&<button class="g-secondary" style={{marginTop:'12px',marginLeft:'8px'}} onClick={()=>{request.current?.abort();request.current=null;setBusy(false);setApproved(false);}}>Cancel staging</button>}</>:<p class="g-small">Synthetic preview data is already separate from live Canvas. Use the seeded local Canvas replica for the demo; live-account copying is available only in the signed-in HTTPS Canvas tab.</p>}
    {error&&<p class="g-notice" role="alert" style={{marginTop:'10px'}}>{error}</p>}
    {result&&<div style={{marginTop:'12px'}} role="status"><strong>{result.courseCount} courses · {result.assignmentCount} assignments staged</strong><p class="g-small">{result.message}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'13px',marginTop:'10px'}}>{result.command}</pre><ul>{result.limitations.map((limitation,index)=><li key={index}>{limitation}</li>)}</ul></div>}
  </section>;
}
