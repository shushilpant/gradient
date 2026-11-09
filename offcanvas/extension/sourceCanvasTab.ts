import type { StudyMaterial } from './canvasMaterials.js';

interface CanvasFileInput { origin: string; courseId: string; resource: StudyMaterial }
interface SenderContext { windowId?: number; incognito?: boolean }
interface FileBytes { title: string; mimeType: string; data: string }
interface DownloadDescriptor { title: string; mimeType: string; downloadUrl: string }
const SIGN_IN = 'Open the original Canvas tab and finish signing in, then retry this workflow.';

/** Runs in an isolated world inside the original site's first-party tab. */
async function readInCanvasTab(origin: string, fileId: string, title: string): Promise<FileBytes | DownloadDescriptor> {
  // This function is serialized by Chrome: keep every dependency inside it.
  const signIn = 'Open the original Canvas tab and finish signing in, then retry this workflow.';
  if (location.origin !== origin) throw new Error(signIn);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  const maxBytes = 12 * 1024 * 1024;
  try {
    const metadata = await fetch(origin + '/api/v1/files/' + fileId, {method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
    if (metadata.status === 401) throw new Error(signIn);
    if (!metadata.ok) throw new Error(`Canvas attachment metadata returned HTTP ${metadata.status}.`);
    const raw = await metadata.text();
    let record: any;
    try { record = JSON.parse(raw.replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, '')); }
    catch { throw new Error(signIn); }
    if (record.locked_for_user || record.hidden_for_user || record.published === false) throw new Error('This Canvas attachment is locked or unpublished.');
    if (record.size > maxBytes) throw new Error('The Canvas attachment exceeds the 12 MB reading limit.');
    const name = typeof record.display_name === 'string' ? record.display_name : title;
    const mime = typeof record['content-type'] === 'string' ? record['content-type'] : 'application/octet-stream';
    if (typeof record.url !== 'string') throw new Error('Canvas did not return an attachment download link.');
    const url = new URL(record.url, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Canvas returned an unsupported attachment download link.');
    if (url.origin !== origin) return {title:name,mimeType:mime,downloadUrl:url.href};
    let response: Response;
    try { response = await fetch(url.href, {method:'GET',credentials:'include',redirect:'follow',signal:controller.signal}); }
    catch (error) {
      // A signed same-origin link can redirect to a CDN that does not permit
      // page-origin CORS. Retry only explicit signed URLs in the worker.
      const signed = ['verifier','signature','token','X-Amz-Signature'].some(key => url.searchParams.has(key));
      if (error instanceof TypeError && signed) return {title:name,mimeType:mime,downloadUrl:url.href};
      throw error;
    }
    if (response.status === 401 || /\/login(?:\/|$)/.test(new URL(response.url || url.href).pathname)) throw new Error(signIn);
    if (!response.ok) throw new Error(`Canvas attachment download returned HTTP ${response.status}.`);
    if (Number(response.headers.get('Content-Length')) > maxBytes) throw new Error('The Canvas attachment exceeds the 12 MB reading limit.');
    if (!response.body) throw new Error('Canvas returned an empty attachment.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const {done,value} = await reader.read(); if(done) break;
        size += value.byteLength;
        if(size > maxBytes) throw new Error('The Canvas attachment exceeds the 12 MB reading limit.');
        chunks.push(value);
      }
    } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset=0;
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
    const contentType=response.headers.get('Content-Type') || mime;
    if (/text\/html/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html)/i.test(new TextDecoder().decode(bytes.subarray(0,200)))) throw new Error(signIn);
    let binary=''; for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {title:name,mimeType:contentType,data:btoa(binary)};
  } finally {clearTimeout(timer);}
}

function publicDownload(value: string): URL {
  const url = new URL(value);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || url.port || !host.includes('.') || host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':')) throw new Error('Canvas returned an unsupported attachment download host.');
  return url;
}

async function signedDownload(descriptor: DownloadDescriptor): Promise<FileBytes> {
  const url=publicDownload(descriptor.downloadUrl);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
  try {
    const response=await fetch(url.href,{method:'GET',credentials:'omit',redirect:'follow',signal:controller.signal});
    if(response.url) publicDownload(response.url);
    if(!response.ok) throw new Error(`Signed Canvas attachment download returned HTTP ${response.status}.`);
    const maxBytes=12*1024*1024;
    if(Number(response.headers.get('Content-Length'))>maxBytes || !response.body) throw new Error('The attachment is empty or exceeds the 12 MB reading limit.');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('The attachment exceeds the 12 MB reading limit.');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const mime=response.headers.get('Content-Type')||descriptor.mimeType;
    if(/text\/html/i.test(mime) || /^\s*(?:<!doctype\s+html|<html)/i.test(new TextDecoder().decode(bytes.subarray(0,200)))) throw new Error(SIGN_IN);
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {title:descriptor.title,mimeType:mime,data:btoa(binary)};
  }finally{clearTimeout(timer);}
}

/** Keep authentication first-party: the extension worker never requests Canvas session endpoints. */
export async function readCanvasFileInTab(input: CanvasFileInput, sender: SenderContext = {}): Promise<FileBytes> {
  const origin=new URL(input.origin);
  if(origin.origin!==input.origin || origin.protocol!=='https:' || origin.username || origin.password || origin.port || !(origin.hostname==='instructure.com'||origin.hostname.endsWith('.instructure.com')||origin.hostname==='canvas.usm.edu')) throw new Error('Choose an official HTTPS Canvas origin.');
  const resource=new URL(input.resource.url);
  const match=resource.pathname.match(/^\/(?:courses\/(\d+)\/)?files\/(\d+)(?:\/download)?\/?$/);
  if(resource.origin!==origin.origin||resource.username||resource.password||!match||!/^\d+$/.test(input.courseId)||(match[1]&&match[1]!==input.courseId))throw new Error('Choose an attachment in the selected Canvas course.');
  const tabs=(await chrome.tabs.query({url:origin.origin+'/*'})).filter(tab=>tab.id!==undefined && (sender.incognito===undefined || !!tab.incognito===sender.incognito));
  tabs.sort((a,b)=>Number(b.windowId===sender.windowId)-Number(a.windowId===sender.windowId)||Number((b.url||'').includes('/courses/'+input.courseId))-Number((a.url||'').includes('/courses/'+input.courseId)));
  let tab=tabs[0];let created=false;let successful=false;
  if(!tab){
    if(sender.incognito && sender.windowId===undefined)throw new Error(SIGN_IN);
    tab=await chrome.tabs.create({url:origin.origin+(input.courseId==='0'?'/':'/courses/'+input.courseId),active:false,...(sender.windowId!==undefined?{windowId:sender.windowId}:{})});created=true;
  }
  if(tab.id===undefined)throw new Error('Could not open the original Canvas tab.');
  const tabId=tab.id;
  try{
    if(sender.incognito!==undefined&&!!tab.incognito!==sender.incognito)throw new Error(SIGN_IN);
    const deadline=Date.now()+15000;
    while(tab.status!=='complete' && Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));tab=await chrome.tabs.get(tabId);}
    if(tab.status!=='complete')throw new Error('The original Canvas tab is still loading. Retry after it finishes.');
    if(!tab.url||new URL(tab.url).origin!==origin.origin)throw new Error(SIGN_IN);
    let results:chrome.scripting.InjectionResult<FileBytes|DownloadDescriptor>[];
    try{results=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:readInCanvasTab,args:[origin.origin,match[2]!,input.resource.title]});}
    catch(error){const detail=error instanceof Error?error.message:String(error);throw new Error(detail.includes('Canvas')||detail.includes('attachment')?detail:SIGN_IN);}
    const result=results[0]?.result;
    if(!result)throw new Error(SIGN_IN);
    const file='downloadUrl'in result ? await signedDownload(result) : result;
    if(typeof file.data!=='string'||!file.data||file.data.length>16777216)throw new Error('Canvas returned invalid attachment bytes.');
    successful=true;return file;
  }finally{if(created&&successful)await chrome.tabs.remove(tabId).catch(()=>{});}
}
