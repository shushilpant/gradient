import {courseworkDestination} from './pageNavigation.js';
import {downloadAssignmentPdf} from './assignmentExport.js';
import {captureBrowserContext,loadAssistantSettings,planBrowserAction,generateStudyPacket} from './assistantClient.js';
import {loadCanvasSnapshot} from './liveCanvas.js';
import {canvasHtmlText} from './canvasMaterials.js';
import {homeworkAutopilotBlock} from './homeworkAutopilot.js';
import {shouldRunOnPage} from './safetyGuard.js';
const KEY='gradient_page_autopilot';
let working=false;
let activeRequest:AbortController|null=null;
type Run={id:string;goal:string;steps:number;active:boolean;label:string};
function saved():Run|null {try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function save(run:Run){sessionStorage.setItem(KEY,JSON.stringify(run));}
function bar(run:Run){
  let host=document.getElementById('gradient-page-control');
  if(!host){host=document.createElement('div');host.id='gradient-page-control';host.style.cssText='position:fixed;bottom:20px;left:24px;right:24px;z-index:2147483647;background:linear-gradient(125deg,#ff7a22,#ff3d00);color:white;padding:16px 20px;border-radius:999px;font:700 16px Figtree,system-ui;box-shadow:0 18px 40px -14px rgba(255,61,0,.5);display:flex;gap:16px;align-items:center';document.body.append(host);}
  host.replaceChildren();const label=document.createElement('span');label.style.flex='1';label.textContent=run.label;host.append(label);
  const stop=document.createElement('button');stop.textContent=run.active?'Stop Auto':'Dismiss';stop.style.cssText='padding:12px 22px;border:0;border-radius:999px;background:white;color:#ff4a12;cursor:pointer;font:800 16px Figtree,system-ui';stop.onclick=()=>{activeRequest?.abort();activeRequest=null;sessionStorage.removeItem(KEY);host?.remove();document.getElementById('gradient-panel-host')?.style.removeProperty('display');};host.append(stop);
}
export function startPageAutopilot(goal:string){
  if(!/^http:\/\/(127\.0\.0\.1|localhost):8080$/.test(location.origin))throw new Error('Open the local Canvas page on port 8080 to let Auto control this tab.');
  if(!shouldRunOnPage(location.href,document))throw new Error('Auto is unavailable on this assessment or unsupported Canvas page.');
  const run={id:crypto.randomUUID(),goal,steps:0,active:true,label:'Auto is taking control of this Canvas tab…'};save(run);bar(run);
  const panel=document.getElementById('gradient-panel-host');if(panel)panel.style.display='none';
  void resumePageAutopilot();
}
export async function resumePageAutopilot(){
  const stored=saved();if(!stored?.active||working)return;const run:Run=stored;
  const isCurrent=()=>saved()?.id===run.id&&saved()?.active===true;
  if(!/^http:\/\/(127\.0\.0\.1|localhost):8080$/.test(location.origin))return;
  if(!run.id||!shouldRunOnPage(location.href,document)){sessionStorage.removeItem(KEY);return;}
  const controller=new AbortController();activeRequest=controller;
  working=true;bar(run);const panel=document.getElementById('gradient-panel-host');if(panel)panel.style.display='none';
  try{
    const settings=await loadAssistantSettings();
    for(;run.steps<20;run.steps++){
      if(!isCurrent()||controller.signal.aborted)return;
      if(!shouldRunOnPage(location.href,document))throw new Error('An assessment was detected. Auto stopped.');
      run.label='Reading this Canvas page…';save(run);bar(run);
      const match=location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/?$/);
      if(match){
        const snapshot=await loadCanvasSnapshot({courseId:match[1]});
        const course=snapshot.courses.find(c=>c.id===match[1]);const assignment=course?.assignments.find(a=>a.id===match[2]);
        if(!course||!assignment)throw new Error('The current homework could not be read.');
        const blocked=homeworkAutopilotBlock(assignment);if(blocked)throw new Error(blocked);
        const packet=await generateStudyPacket(settings,{course:{id:course.id,name:course.name,code:course.code},assignment:{id:assignment.id,title:assignment.name,description:canvasHtmlText(assignment.descriptionHtml),url:location.href,dueAt:assignment.dueAt??null,submissionTypes:assignment.submissionTypes,rubric:assignment.rubric?.map(criterion=>`${criterion.description} (${criterion.points} points): ${criterion.ratings.map(rating=>rating.description).join('; ')}`).join('\n')},autopilot:true,assignmentKind:'homework',prompt:run.goal,level:'all_in',mode:'sample',model:settings.reasoningModel,webResearch:true,resources:course.resources.filter(r=>r.type!=='module').map(r=>({title:r.title,url:r.url}))},progress=>{if(isCurrent()&&!controller.signal.aborted){run.label=progress.label;save(run);bar(run);}},controller.signal);
        if(!isCurrent()||controller.signal.aborted)return;
      if(!shouldRunOnPage(location.href,document))throw new Error('An assessment was detected. Auto stopped.');
        run.label='Rendering the final assignment PDF…';save(run);bar(run);
        await downloadAssignmentPdf(settings,packet);
        run.active=false;run.label='AI-generated reference PDF downloaded. Review its calculations, sources and course policy.';save(run);bar(run);return;
      }
      const context=await captureBrowserContext();
      const plan=await planBrowserAction(settings,{...context,goal:run.goal+' Navigate to the matching homework assignment page. Choose an observed coursework link.',model:context.screenshot?settings.visionModel:settings.reasoningModel});
      if(!isCurrent()||controller.signal.aborted)return;
      if(!shouldRunOnPage(location.href,document))throw new Error('An assessment was detected. Auto stopped.');
      const observed=Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(a=>!a.closest('#gradient-panel-host,#gradient-page-control')).map(a=>a.href);
      const candidates=plan.actions.filter(a=>a.url&&(a.kind==='open'||a.kind==='read')).map(action=>({action,url:courseworkDestination(action.url!,location.href,observed)}));
      const selected=candidates.find(candidate=>candidate.url);
      if(selected?.url){
        run.steps++;run.label=selected.action.description;save(run);bar(run);location.assign(selected.url);return;
      }
      if(candidates.length){
        run.label='Refreshing Canvas links before choosing another route…';save(run);bar(run);
        await new Promise(resolve=>setTimeout(resolve,1000));
        continue;
      }
      if(plan.actions.some(a=>a.kind==='scroll')){window.scrollBy(0,innerHeight*.7);continue;}
      throw new Error(plan.summary||'No coursework navigation was available.');
    }
    throw new Error('Auto reached its navigation limit.');
  }catch(error){if(isCurrent()&&!controller.signal.aborted){run.active=false;run.label=error instanceof Error?error.message:'Auto stopped.';save(run);bar(run);}}
  finally{if(activeRequest===controller)activeRequest=null;working=false;}
}
