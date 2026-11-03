import {courseworkDestination} from './pageNavigation.js';
import {downloadAssignmentPdf} from './assignmentExport.js';
import {captureBrowserContext,loadAssistantSettings,planBrowserAction,generateStudyPacket} from './assistantClient.js';
import {loadCanvasSnapshot} from './liveCanvas.js';
import {canvasHtmlText} from './canvasMaterials.js';
const KEY='gradient_page_autopilot';
let working=false;
type Run={goal:string;steps:number;active:boolean;label:string};
function saved():Run|null {try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function save(run:Run){sessionStorage.setItem(KEY,JSON.stringify(run));}
function bar(run:Run){
  let host=document.getElementById('gradient-page-control');
  if(!host){host=document.createElement('div');host.id='gradient-page-control';host.style.cssText='position:fixed;bottom:20px;left:24px;right:24px;z-index:2147483647;background:linear-gradient(125deg,#ff7a22,#ff3d00);color:white;padding:16px 20px;border-radius:999px;font:700 16px Figtree,system-ui;box-shadow:0 18px 40px -14px rgba(255,61,0,.5);display:flex;gap:16px;align-items:center';document.body.append(host);}
  host.replaceChildren();const label=document.createElement('span');label.style.flex='1';label.textContent=run.label;host.append(label);
  const stop=document.createElement('button');stop.textContent=run.active?'Stop Auto':'Dismiss';stop.style.cssText='padding:12px 22px;border:0;border-radius:999px;background:white;color:#ff4a12;cursor:pointer;font:800 16px Figtree,system-ui';stop.onclick=()=>{sessionStorage.removeItem(KEY);host?.remove();document.getElementById('gradient-panel-host')?.style.removeProperty('display');};host.append(stop);
}
export function startPageAutopilot(goal:string){
  if(!/^http:\/\/(127\.0\.0\.1|localhost):8080$/.test(location.origin))throw new Error('Open the local Canvas page on port 8080 to let Auto control this tab.');
  const run={goal,steps:0,active:true,label:'Auto is taking control of this Canvas tab…'};save(run);bar(run);
  const panel=document.getElementById('gradient-panel-host');if(panel)panel.style.display='none';
  void resumePageAutopilot();
}
export async function resumePageAutopilot(){
  const stored=saved();if(!stored?.active||working)return;const run:Run=stored;
  if(!/^http:\/\/(127\.0\.0\.1|localhost):8080$/.test(location.origin))return;
  working=true;bar(run);const panel=document.getElementById('gradient-panel-host');if(panel)panel.style.display='none';
  try{
    const settings=await loadAssistantSettings();
    for(;run.steps<20;run.steps++){
      if(!saved()?.active)return;
      run.label='Reading this Canvas page…';save(run);bar(run);
      const match=location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/?$/);
      if(match){
        const snapshot=await loadCanvasSnapshot({courseId:match[1]});
        const course=snapshot.courses.find(c=>c.id===match[1]);const assignment=course?.assignments.find(a=>a.id===match[2]);
        if(!course||!assignment)throw new Error('The current homework could not be read.');
        const packet=await generateStudyPacket(settings,{course:{id:course.id,name:course.name,code:course.code},assignment:{id:assignment.id,title:assignment.name,description:canvasHtmlText(assignment.descriptionHtml),url:location.href,dueAt:assignment.dueAt??null,submissionTypes:assignment.submissionTypes},autopilot:true,assignmentKind:'homework',prompt:run.goal,level:'all_in',mode:'sample',model:settings.reasoningModel,webResearch:true,resources:course.resources.filter(r=>r.type!=='module').map(r=>({title:r.title,url:r.url}))},progress=>{if(saved()?.active){run.label=progress.label;save(run);bar(run);}});
        if(!saved()?.active)return;
        run.label='Rendering the final assignment PDF…';save(run);bar(run);
        await downloadAssignmentPdf(settings,packet);
        run.active=false;run.label='Assignment PDF downloaded. Review its calculations and sources.';save(run);bar(run);return;
      }
      const context=await captureBrowserContext();
      const plan=await planBrowserAction(settings,{...context,goal:run.goal+' Navigate to the matching homework assignment page. Choose an observed coursework link.',model:context.screenshot?settings.visionModel:settings.reasoningModel});
      if(!saved()?.active)return;
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
  }catch(error){if(saved()?.active){run.active=false;run.label=error instanceof Error?error.message:'Auto stopped.';save(run);bar(run);}}
  finally{working=false;}
}
