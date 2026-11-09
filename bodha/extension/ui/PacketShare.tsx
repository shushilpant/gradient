import { useEffect, useState } from 'preact/hooks';
import * as QRCode from 'qrcode';
import { z } from 'zod';
import type { StudyPacket } from '../assistantTypes.js';
import { loadAssistantSettings } from '../assistantClient.js';
import { assistantRequest } from '../assistantTransport.js';
export function PacketShare({ packet }: { packet: StudyPacket }) {
  const [share,setShare]=useState<{token:string;url:string;expires:number;qr:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!share)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[share?.token]);
  async function publish() {
    setBusy(true);setError('');
    try {const config=await loadAssistantSettings();const data=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{32}$/),url:z.string().url(),expiresInSeconds:z.number()}).parse(await assistantRequest(config.backendUrl,'/api/v1/assistant/shares','POST',{title:packet.title,markdown:[packet.summary,packet.markdown,packet.sampleMarkdown?'## Labelled reference sample\n'+packet.sampleMarkdown:'',...(packet.warnings.map(warning=>'Note: '+warning))].filter(Boolean).join('\n\n'),sources:packet.sources.map(source=>({title:source.title,url:source.url,excerpt:source.excerpt??''})),figures:(packet.renderedVisuals??[]).map(figure=>({title:figure.title,data:figure.data,caption:figure.caption}))}));const qr=await QRCode.toDataURL(data.url,{width:256,margin:2,errorCorrectionLevel:'M'});setNow(Date.now());setShare({...data,expires:Date.now()+data.expiresInSeconds*1000,qr});}
    catch(reason){setError(reason instanceof Error?reason.message:'The packet could not be shared. Export HTML instead.');}finally{setBusy(false);}
  }
  async function revoke() {if(!share)return;setBusy(true);try{const config=await loadAssistantSettings();await assistantRequest(config.backendUrl,`/api/v1/assistant/shares/${share.token}/revoke`,'POST',{});setShare(null);}catch(reason){setError(reason instanceof Error?reason.message:'Revocation failed. The link will still expire automatically.');}finally{setBusy(false);}}
  return <section class="ps-share" aria-label="Share packet to phone"><h3>Take this packet with you</h3><p class="jc-muted">Creates a read-only link for 20 minutes. Your phone must be on the same Wi-Fi as this computer. Anyone with the link on that network can read the packet.</p>{share&&share.expires>now?<><img class="ps-qr" src={share.qr} alt="Scan to open this study packet on your phone"/><a class="jc-source" href={share.url} target="_blank" rel="noopener noreferrer">{share.url}</a><p class="jc-muted">Expires in {Math.ceil((share.expires-now)/60000)} min. The computer and assistant must stay running. If your Wi-Fi isolates devices or blocks port 8767, use the HTML export.</p><button class="jc-btn" disabled={busy} onClick={()=>void revoke()}>Revoke phone link</button></>:<button class="jc-btn" disabled={busy} onClick={()=>void publish()}>{busy?'Creating phone link…':share?'Create a new phone link':'Share packet to phone'}</button>}{error&&<p class="jc-error" role="alert">{error}</p>}</section>;
}
