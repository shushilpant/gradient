import type { StudyPacket, StudyProgress } from '../assistantTypes.js';

const STAGES = [
  { id:'reading',label:'Read'}, {id:'parsing',label:'Plan'}, {id:'researching',label:'Research'},
  {id:'drafting',label:'Draft'}, {id:'rendering',label:'Render'}, {id:'reviewing',label:'Check'},
];
export function AutopilotProgress({progress}:{progress:StudyProgress|null}) {
  const stage = progress?.stage === 'revising' ? 'reviewing' : progress?.stage;
  const active = STAGES.findIndex(item=>item.id===stage);
  return <div class="ja-autopilot-progress" role="status" aria-live="polite">
    <ol class="ja-stages" aria-label="Autopilot workflow">{STAGES.map((item,index)=><li key={item.id} class={index===active?'current':index<active?'done':''}><span>{String(index+1).padStart(2,'0')}</span>{item.label}</li>)}</ol>
    <p>{progress?.label || 'Working…'}</p>
  </div>;
}

export function WorkEvidence({packet}:{packet:StudyPacket}) {
  const brief=packet.brief;
  const review=packet.review;
  if (!brief) return null;
  const covered=review?.coverage.filter(item=>item.status==='covered').length ?? 0;
  return <section class="ja-requirements" aria-label="Assignment requirements and review">
    <div class="ja-row"><h3>Requirements</h3><span class="ja-evidence-count">{review?`${covered}/${brief.requirements.length} covered`:'Brief parsed'}</span></div>
    <p class="ja-note">{brief.summary}</p>
    <ol class="ja-coverage">{brief.requirements.map(requirement=>{
      const check=review?.coverage.find(item=>item.requirementId===requirement.id);
      return <li key={requirement.id}><div class="ja-row"><strong>{requirement.text}</strong><span class={`ja-coverage-status ${check?.status||'pending'}`}>{check?.status==='covered'?'Covered':check?.status==='partial'?'Partial':check?.status==='missing'?'Needs work':'Planned'}</span></div>
        <details><summary>Evidence & review</summary><blockquote>{requirement.evidence}</blockquote>{check?.evidence && <p><strong>In the sample:</strong> {check.evidence}</p>}{check?.notes && <p>{check.notes}</p>}</details></li>;
    })}</ol>
    {brief.missingInformation.length>0 && <div class="ja-notice warning"><strong>Information still needed</strong><ul>{brief.missingInformation.map((item,i)=><li key={i}>{item}</li>)}</ul></div>}
    {!!review?.limitations.length && <div class="ja-notice warning"><strong>Review limits</strong><ul>{review.limitations.map((item,i)=><li key={i}>{item}</li>)}</ul></div>}
  </section>;
}

export function ComputedVisuals({packet}:{packet:StudyPacket}) {
  const figures=packet.renderedVisuals ?? [];
  return <>{figures.map(figure=><figure class="ja-visual ja-rendered-visual" key={figure.id}>
    <div class="ja-row"><figcaption>{figure.title}</figcaption><span class="ja-figure-method">{figure.verification==='computed'?'Python · computed':figure.verification==='source-data'?'Python · source data':'Python · conceptual'}</span></div>
    <img src={`data:image/png;base64,${figure.data}`} alt={figure.caption || figure.title}/>
    <p class="ja-note">{figure.caption}</p>
    <details><summary>Figure provenance</summary><p class="ja-note">Source [{figure.provenance.sourceId}] · {packet.sources.find(source=>source.id===figure.provenance.sourceId)?.title || 'Assignment evidence'}</p><blockquote>{figure.provenance.quote}</blockquote></details>
  </figure>)}</>;
}
