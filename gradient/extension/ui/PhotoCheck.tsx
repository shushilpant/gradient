import { useEffect, useRef, useState } from 'preact/hooks';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { checkHomeworkPhoto, loadAssistantSettings } from '../assistantClient.js';
import { homeworkAutopilotBlock } from '../homeworkAutopilot.js';
import { canvasHtmlText } from '../canvasMaterials.js';
export function PhotoCheck({ snapshot, active }: { snapshot: CanvasSnapshot; active: boolean }) {
  const tasks = snapshot.courses.flatMap(course => course.assignments.map(assignment => ({course,assignment})));
  const [taskId,setTaskId] = useState('');
  const task = tasks.find(item => `${item.course.id}/${item.assignment.id}` === taskId);
  const [image,setImage] = useState('');
  const [text,setText] = useState('');
  const [confirmed,setConfirmed] = useState(false);
  const [reviewed,setReviewed] = useState(false);
  const [camera,setCamera] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [result,setResult] = useState<Awaited<ReturnType<typeof checkHomeworkPhoto>> | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const activeRef = useRef(active); activeRef.current=active;
  useEffect(() => { alive.current=true; return () => { alive.current=false; stream.current?.getTracks().forEach(track => track.stop()); abort.current?.abort(); }; },[]);
  useEffect(()=>{if(!active){stopCamera();abort.current?.abort();setBusy(false);}},[active]);
  const blocked = task ? homeworkAutopilotBlock(task.assignment) : null;
  function stopCamera() { stream.current?.getTracks().forEach(track => track.stop()); stream.current=null; setCamera(false); }
  function resetPhoto(url:string) { setImage(url);setText('');setResult(null);setReviewed(false);setError(''); }
  async function readFile(file:File) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12000000) {setError('Choose a PNG, JPEG or WebP photo under 12 MB.');return;}
    const url=URL.createObjectURL(file);
    try { const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1800/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);resetPhoto(canvas.toDataURL('image/jpeg',.9)); }
    catch {setError('This image could not be opened. Try a JPEG or PNG.');} finally {URL.revokeObjectURL(url);}
  }
  async function run(phase:'read'|'critique') {
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try {const settings=await loadAssistantSettings();const response=await checkHomeworkPhoto({phase,image:image.split(',')[1]??'',model:settings.visionModel,title:task?.assignment.name??'Homework',instructions:task?canvasHtmlText(task.assignment.descriptionHtml).slice(0,20000):'',transcription:text,rubric:task?.assignment.rubric,homeworkConfirmed:confirmed},controller.signal);if(!controller.signal.aborted&&alive.current){setResult(response);if(phase==='read'){setText(response.transcription);setReviewed(false);}}}
    catch(reason){if(!controller.signal.aborted&&alive.current)setError(reason instanceof Error?reason.message:'The photo check failed.');}
    finally{if(alive.current&&abort.current===controller)setBusy(false);}
  }
  return <div class="jc"><div><div class="jc-kicker">Your work · your reasoning</div><h1>Check handwritten work</h1><p class="jc-sub">Photograph your work, review what was read, then get rubric-aligned pointers.</p></div>
    <select class="g-select" aria-label="Photo assignment" disabled={busy} value={taskId} onChange={event=>{setTaskId(event.currentTarget.value);setResult(null);setConfirmed(false);setReviewed(false);}}><option value="">General homework · no course rubric</option>{tasks.map(item=><option key={`${item.course.id}/${item.assignment.id}`} value={`${item.course.id}/${item.assignment.id}`}>{item.course.code}: {item.assignment.name}</option>)}</select>
    <label class="jc-muted"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.currentTarget.checked)}/> This is my ordinary homework, not a quiz, exam, or timed assessment.</label>{blocked&&<p class="jc-error">{blocked}</p>}
    <section class="jc-section"><h2>1. Add your work</h2><label class="jc-btn photo-file">Choose a photo<input aria-label="Upload homework photo" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void readFile(file);}}/></label>
    <button class="jc-btn" disabled={busy} onClick={async()=>{if(camera){stopCamera();return;}try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is unavailable here. Use Choose a photo instead.');const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});if(!alive.current||!activeRef.current){media.getTracks().forEach(track=>track.stop());return;}stream.current=media;setCamera(true);requestAnimationFrame(()=>{if(video.current){video.current.srcObject=media;void video.current.play();}});}catch(reason){setError(reason instanceof Error?reason.message:'Camera access failed. Upload a photo instead.');}}}>{camera?'Close camera':'Use webcam'}</button>
    {camera&&<><video ref={video} autoPlay playsInline muted class="photo-preview"/><button class="jc-btn primary" onClick={()=>{const view=video.current;if(!view?.videoWidth){setError('Wait for the camera image, then try again.');return;}const canvas=document.createElement('canvas');const scale=Math.min(1,1800/Math.max(view.videoWidth,view.videoHeight));canvas.width=Math.round(view.videoWidth*scale);canvas.height=Math.round(view.videoHeight*scale);canvas.getContext('2d')!.drawImage(view,0,0,canvas.width,canvas.height);resetPhoto(canvas.toDataURL('image/jpeg',.9));stopCamera();}}>Take photo</button></>}
    {image&&<img class="photo-preview" src={image} alt="Your handwritten homework"/>}<button class="jc-btn primary" disabled={!image||!confirmed||!!blocked||busy} onClick={()=>void run('read')}>{busy?'Working…':'Read handwriting'}</button><p class="jc-muted">Use clear light and keep the page flat. Images are sent only to the local vision model. You can also type your work below.</p></section>
    {error&&<p class="jc-error" role="alert">{error}</p>}
    <section class="jc-section"><h2>2. Confirm the transcription</h2><textarea class="photo-text" aria-label="Confirmed homework transcription" value={text} onInput={event=>{setText(event.currentTarget.value);setReviewed(false);setResult(null);}} placeholder="Your handwriting will appear here. Correct equations, symbols, or units—or type your own work." rows={9}/>{result?.uncertainties.map((item,i)=><p class="jc-alert" key={i}>{item}</p>)}<label class="jc-muted"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.currentTarget.checked)}/> I checked this transcription against my original work.</label><button class="jc-btn primary" disabled={busy||text.trim().length<15||!reviewed||!confirmed||!!blocked} onClick={()=>void run('critique')}>Check against rubric</button></section>
    {result?.critique&&<section class="jc-section" aria-label="Photo critique"><h2>3. Improve your reasoning</h2><p>{result.critique.feedbackSummary}</p>{result.critique.criteria.map((criterion,i)=><article class="jc-message" key={i}><h3>{criterion.criterionDescription}</h3><p>{criterion.readinessLevel}</p>{criterion.evidenceQuotes.map((quote,index)=><blockquote key={index}>{quote}</blockquote>)}<p>{criterion.whatWouldRaiseIt}</p></article>)}</section>}{result?.warnings.map((warning,i)=><p class="jc-muted" key={i}>{warning}</p>)}
  </div>;
}
