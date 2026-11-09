import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { StudySource } from '../assistantTypes.js';
export const InspectEvidence = createContext<((source: StudySource) => void) | null>(null);
export const EvidenceSources = createContext<StudySource[]>([]);
export function SourceCitation({ sourceId }: { sourceId: string }) {
  const sources = useContext(EvidenceSources);
  const inspect = useContext(InspectEvidence);
  const source = sources.find(item => item.id === sourceId);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  if (!source) return <span title="No matching source was supplied">[{sourceId}]</span>;
  let href: string | undefined;
  try { const url = new URL(source.url); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch { /* No unsafe navigation. */ }
  const fullText = source.documentText ?? '';
  const excerpt = source.excerpt ?? '';
  const position = excerpt ? fullText.indexOf(excerpt) : -1;
  return <span class="pv-reference" onMouseEnter={() => {if(inspect)inspect(source);else setOpen(true);}} onMouseLeave={() => { if(!pinned) setOpen(false); }}>
    <button class="pv-citation" aria-label={`Show evidence ${sourceId}: ${source.title}`} aria-expanded={open} onFocus={() => {if(inspect)inspect(source);else setOpen(true);}} onClick={() => { if(inspect){inspect(source);return;}setPinned(true);setOpen(true); }} onKeyDown={event => { if(event.key==='Escape'){setPinned(false);setOpen(false);} }}>[{sourceId}]</button>
    {open && <span class="pv-evidence" role="region" aria-label={`Evidence ${sourceId}`}><strong>{source.title}</strong>{position >= 0 ? <span class="pv-document">{fullText.slice(Math.max(0,position-450),position)}<mark>{excerpt}</mark>{fullText.slice(position+excerpt.length,position+excerpt.length+450)}</span> : <mark>{excerpt || 'The source was linked, but no excerpt was returned. Open the original to verify this claim.'}</mark>}<small>Source excerpt; citation presence does not independently verify the claim.</small>{href && <a href={href} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}<button aria-label={`Close evidence ${sourceId}`} onClick={() => {setPinned(false);setOpen(false);}}>Close</button></span>}
  </span>;
}

export function SourceEvidence({source}:{source:StudySource}) {
  const full=source.documentText??'';const excerpt=source.excerpt??'';const position=excerpt?full.indexOf(excerpt):-1;
  let url:string|undefined;try{const parsed=new URL(source.url);if(['https:','http:'].includes(parsed.protocol))url=parsed.href;}catch{}
  return <><h3>{source.title}</h3><div class="pv-document">{position>=0&&full.slice(Math.max(0,position-450),position)}<mark>{excerpt||'No source excerpt was supplied. Open the original document to check this claim.'}</mark>{position>=0&&full.slice(position+excerpt.length,position+excerpt.length+450)}</div>{url&&<a href={url} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}<small>Exact excerpts show provenance; they do not independently verify the claim. Context is shown when readable source text was available.</small></>;
}
