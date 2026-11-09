import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { z } from 'zod';
import type { CanvasSnapshot } from '../liveCanvas.js';
import { getAcademicContext, readAcademicMaterials, subscribeAcademicContext, type AcademicContext, type AcademicEvidence } from '../academicContext.js';
import { assistantRequest } from '../assistantTransport.js';
import { enableBrowserSearch, loadAssistantSettings, searchReuOpportunities } from '../assistantClient.js';

const opportunitySchema = z.object({ title:z.string(),url:z.string().url(),matchedTopics:z.array(z.string()),summary:z.string(),
  deadlineEvidence:z.string().nullable(),eligibilityEvidence:z.string().nullable(),fundingEvidence:z.string().nullable(),
  deadlineSummary:z.string().nullable().optional(),eligibilitySummary:z.string().nullable().optional(),fundingSummary:z.string().nullable().optional(),summaryWarning:z.string().optional(),
  status:z.string(),skills:z.array(z.string()).optional().default([]),skillEvidence:z.record(z.string()).optional().default({}),applicationUrl:z.string().url().nullable().optional() });
const resultSchema = z.object({opportunities:z.array(opportunitySchema).max(20),query:z.string(),checkedAt:z.string(),message:z.string()});
type Result = z.infer<typeof resultSchema>;
function Evidence({items}:{items:AcademicEvidence[]}) {
  return <div class="reu-evidence">{items.filter(item => item.title.trim() && item.excerpt.trim()).map((item,index)=><div class="pv-evidence" key={`${item.url}|${index}`}><a href={/^https?:\/\//.test(item.url)?item.url:undefined} target="_blank" rel="noopener noreferrer">{item.courseCode}: {item.title}</a><p class="jc-muted">“{item.excerpt}”</p></div>)}</div>;
}
export function ReuFinder({snapshot,context:provided}:{snapshot:CanvasSnapshot;context?:AcademicContext}) {
  const context=useMemo(()=>provided??getAcademicContext(snapshot),[provided,snapshot]);
  const [profile,setProfile]=useState(context.research);
  const [topics,setTopics]=useState(()=>context.preferences.researchInterests.length?context.preferences.researchInterests.join(', '):context.research.interests.slice(0,3).map(item=>item.topic).join(', '));
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false),[reading,setReading]=useState(false),[progress,setProgress]=useState('');
  const [warnings,setWarnings]=useState<string[]>([]),[browserSearch,setBrowserSearch]=useState(false),[error,setError]=useState('');
  const request=useRef(0),controller=useRef<AbortController|null>(null);
  useEffect(()=>{setProfile(context.research);return subscribeAcademicContext(context,()=>setProfile(context.research));},[context]);
  useEffect(()=>()=>{request.current++;controller.current?.abort();},[]);
  const stop=()=>{request.current++;controller.current?.abort();setBusy(false);setReading(false);setProgress('Cancelled. You can retry.');};
  async function analyseMaterials() {
    const id=++request.current,abort=new AbortController();controller.current=abort;setReading(true);setError('');setWarnings([]);
    try {
      const settings=await loadAssistantSettings(),collected:string[]=[];
      for(const [index,course] of context.courses.slice(0,8).entries()) {
        abort.signal.throwIfAborted();setProgress(`Reading accessible materials: ${course.code} (${index+1}/${Math.min(context.courses.length,8)})`);
        const materials=await readAcademicMaterials(context,course.id,course.resources.filter(item=>item.type!=='module').slice(0,6),
          file=>assistantRequest(settings.backendUrl,'/api/v1/assistant/materials/extract','POST',file),abort.signal);
        collected.push(...materials.warnings);
      }
      if(id===request.current){setProfile({...context.research});setWarnings(collected);setProgress('Course material analysis complete. Suggestions use readable source text only.');}
    }catch(reason){if(id===request.current)setError(reason instanceof Error?reason.message:'Materials could not be read. Syllabus suggestions remain available.');}
    finally{if(id===request.current)setReading(false);}
  }
  async function search() {
    const selected=[...new Set(topics.split(',').map(s=>s.trim()).filter(Boolean))].slice(0,8),id=++request.current;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);setError('');setResult(null);setProgress('Searching and reading programme pages…');context.preferences.researchInterests=selected;
    try {
      const settings=await loadAssistantSettings();let candidates:{title:string;url:string}[]|undefined;
      if(id!==request.current)return;
      if(browserSearch){
        const response=await chrome.runtime.sendMessage({type:'OFFCANVAS_BROWSER_SEARCH',query:('REU undergraduate summer research '+selected.join(' ')).slice(0,250),limit:8});
        if(id!==request.current)return;
        if(!response?.ok)throw new Error(response?.error||'Browser search failed.');
        candidates=response.data.map((item:{title:string;url:string})=>({title:item.title,url:item.url}));
      }
      const response=resultSchema.parse(await searchReuOpportunities(settings,{topics:selected,...(candidates?{candidates}:{})},state=>{if(id===request.current)setProgress(state.label);},abort.signal));
      if(id===request.current){setResult(response);setProgress('');}
    }catch(reason){if(id===request.current){setError(reason instanceof Error?reason.message:'Search failed. Try again.');setProgress('');}}
    finally{if(id===request.current)setBusy(false);}
  }
  const ranked=useMemo(()=>(result?.opportunities??[]).map(item=>{
    const matchedSkills=profile.skills.filter(skill=>item.skills.some(name=>name.toLowerCase()===skill.name.toLowerCase()));
    const matches=[...profile.interests.filter(interest=>item.matchedTopics.some(topic=>topic.toLowerCase()===interest.topic.toLowerCase())).map(interest=>({label:interest.topic,evidence:interest.evidence})),...matchedSkills.map(skill=>({label:skill.name,evidence:skill.evidence}))];
    const coursework=context.courses.flatMap(course=>{
      const labels=matches.filter(match=>match.evidence.some(evidence=>evidence.courseId===course.id)).map(match=>match.label);
      const reasons=[...new Map(labels.map(label=>[label.toLowerCase(),label])).values()];
      return reasons.length?[{course,reasons}]:[];
    });
    return {...item,matchedSkills,coursework,overlap:item.matchedTopics.length*2+matchedSkills.length};
  }).sort((a,b)=>b.overlap-a.overlap||a.title.localeCompare(b.title)),[result,profile,context]);
  return <div class="jc"><div><span class="jc-kicker">Undergraduate research</span><h1>Research</h1><p class="jc-sub">Discover undergraduate research through your coursework, with evidence for each match.</p></div>
    <section class="jc-section"><h2>Your academic background</h2><p class="jc-muted">{context.courses.map(course=>course.code).join(' · ')||'Sync Canvas to discover your enrolled courses.'}</p>
      <h3>Suggested research interests</h3><p class="jc-muted">Suggestions require a course title, substantive course description, learning objective, or corroborating documents. Incidental examples are excluded; course codes alone do not establish a subject.</p>
      {profile.interests.map(item=><details key={item.topic}><summary><strong>{item.topic}</strong> · {item.courses.join(', ')}</summary><Evidence items={item.evidence}/></details>)}
      {!profile.interests.length&&<p class="jc-muted">No research fields detected in accessible course text. Add your own topics below.</p>}
      <h3>Skills and exposure</h3>
      {profile.skills.map(skill=><details key={skill.name}><summary>{skill.name} · {skill.status==='demonstrated'?'Assessed coursework evidence':'Inferred exposure'}</summary><Evidence items={skill.evidence}/></details>)}
      {!profile.skills.length&&<p class="jc-muted">No specific technical skills identified yet. Read accessible materials to enrich your profile.</p>}
      <p class="jc-muted">Inferred exposure comes from course text and does not establish proficiency. Assessed coursework evidence requires a matching marking criterion awarded full marks by your lecturer; it does not establish independent mastery.</p>
      <button class="g-secondary" disabled={busy||reading} onClick={()=>void analyseMaterials()}>Analyse accessible course materials</button>
      <p class="jc-muted">Reads up to six published pages or files per course, for up to eight courses. PDF and DOCX extraction uses the local service. Restricted content is excluded. Text is cached in memory for this account and sync.</p>
      {!!warnings.length&&<details><summary>{warnings.length} material access notes</summary><ul>{warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
    </section>
    <section class="jc-section"><h2>Find opportunities</h2><label class="g-field-label">Topics, separated by commas<input class="g-select" aria-label="REU research topics" value={topics} disabled={busy||reading} onInput={event=>setTopics(event.currentTarget.value)} maxLength={400}/></label>
      <button class="g-secondary" disabled={busy||reading||!profile.interests.length} onClick={()=>setTopics(profile.interests.slice(0,8).map(item=>item.topic).join(', '))}>Use suggested interests</button>
      <p class="jc-muted">Only these editable topic keywords are sent to public search. Course text, skills, grades, and identity stay local. Your selected local reasoning model summarises programme deadlines, eligibility, and funding.</p>
      <label class="jc-muted"><input type="checkbox" checked={browserSearch} disabled={busy||reading} onChange={async event=>{if(!event.currentTarget.checked){setBrowserSearch(false);return;}const id=request.current;try{const enabled=await enableBrowserSearch();if(id===request.current)setBrowserSearch(enabled);}catch(reason){if(id===request.current)setError(reason instanceof Error?reason.message:'Browser search unavailable.');}}}/>Use Google in the browser (requires site access)</label>
      <button class="g-primary" disabled={busy||reading||!topics.trim()} onClick={()=>void search()}>{busy?'Searching programme pages…':'Find REUs'}</button>
      {(busy||reading)&&<button class="g-secondary" onClick={stop}>Cancel</button>}
      {progress&&<p role="status" class="jc-muted">{progress}</p>}{error&&<p role="alert" class="jc-error">{error}</p>}
    </section>
    {result&&<section class="jc-section" aria-label="REU search results"><p class="jc-muted">Source pages checked {new Date(result.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Current application status is unverified. Overlap does not establish eligibility or admission likelihood.</p>
      {result.message&&<p role="status">{result.message}</p>}
      {ranked.map((item,index)=><article class="jc-message" key={item.url}><h2>{index+1}. <a href={/^https:\/\//.test(item.url)?item.url:undefined} target="_blank" rel="noopener noreferrer">{item.title}</a></h2>
        <p>{item.summary}</p>{item.applicationUrl&&/^https:\/\//.test(item.applicationUrl)&&<p><a href={item.applicationUrl} target="_blank" rel="noopener noreferrer">Application information from programme page</a><span class="jc-muted"> · Current cycle unverified</span></p>}<p class="jc-muted">Overlap score {item.overlap}: {item.matchedTopics.length} topic matches × 2 + {item.matchedSkills.length} skill mentions × 1. A transparent relevance ordering, not a probability.</p>
        <p><strong>Matched topics:</strong> {item.matchedTopics.join(', ')||'None'}</p>
        <p><strong>Skill overlap:</strong> {item.matchedSkills.map(skill=>`${skill.name} (${skill.status==='demonstrated'?'assessed coursework':'inferred exposure'})`).join('; ')||'No supported skill overlap found.'}</p>
        <details><summary>Why this matches your coursework</summary>{item.coursework.length?<ul>{item.coursework.map(({course,reasons})=><li key={course.id}><strong>{course.code} · {course.name}</strong><p class="jc-muted">Matches: {reasons.join(', ')}.</p></li>)}</ul>:<p class="jc-muted">No relevant enrolled course was identified for this match.</p>}</details>
        <details><summary>Deadline, eligibility & funding</summary>{([['Deadline',item.deadlineSummary,item.deadlineEvidence],['Eligibility',item.eligibilitySummary,item.eligibilityEvidence],['Funding',item.fundingSummary,item.fundingEvidence]] as const).map(([label,summary,evidence])=><div key={label}><strong>{label}</strong><p>{summary?.trim()||(evidence?'Summary unavailable. Check the programme page.':'Not found on the source page.')}</p></div>)}{item.summaryWarning&&<p class="jc-muted">{item.summaryWarning}</p>}<p class="jc-muted">{(item.deadlineSummary||item.eligibilitySummary||item.fundingSummary)&&'Summarised locally from the programme page. '}Details may describe a past cycle; confirm them on the linked programme page.</p></details>
      </article>)}
    </section>}
    <a class="jc-source" href="https://www.nsf.gov/funding/initiatives/reu/search" target="_blank" rel="noopener noreferrer">Browse the NSF REU directory</a>
  </div>;
}
