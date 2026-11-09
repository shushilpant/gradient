import { z } from 'zod';
import type { AssistantSettings } from './assistantTypes.js';
import type { ComputerConfig, ComputerSession, ComputerSessionRequest } from './computerTypes.js';
import { assistantRequest, validateBackendUrl } from './assistantTransport.js';
import { packetSchema } from './assistantClient.js';
import type { CanvasSnapshot } from './liveCanvas.js';
import { hydrateCanvasMirrorAssignments } from './canvasMirrorAssignments.js';
import { hydrateCanvasMirrorPages } from './canvasMirrorPages.js';

async function request(settings: AssistantSettings, path: string, method:'GET'|'POST', body?: unknown): Promise<any> {
  const backendUrl=validateBackendUrl(settings.backendUrl);
  return assistantRequest(backendUrl,`/api/v1/computer/${path}`,method,body);
}
const sessionSchema=z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),status:z.enum(['running','complete','cancelled','error']),
  demo:z.boolean().optional(),stage:z.string(),label:z.string(),steps:z.array(z.object({number:z.number().int(),action:z.enum(['observe','open','scroll','read','generate']),url:z.string(),reason:z.string(),screenshot:z.string().max(4000000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/).optional()})).max(100),
  packet:packetSchema.optional(),artifacts:z.array(z.object({name:z.string(),url:z.string()})).optional(),error:z.string().optional(),createdAt:z.string().optional(),
});
export async function getComputerConfig(settings:AssistantSettings):Promise<ComputerConfig> {
  return z.object({browserMode:z.literal('window').optional(),sandboxOrigin:z.string(),engine:z.string(),isolation:z.string(),available:z.boolean(),browserAvailable:z.boolean(),message:z.string()}).parse(await request(settings,'config','GET'));
}
export async function startComputerSession(settings:AssistantSettings,input:ComputerSessionRequest):Promise<ComputerSession> {
  return sessionSchema.parse(await request(settings,'sessions','POST',input));
}
export async function getComputerSession(settings:AssistantSettings,id:string):Promise<ComputerSession> {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error('Invalid browser session.');
  return sessionSchema.parse(await request(settings,`sessions/${id}`,'GET'));
}
export async function cancelComputerSession(settings:AssistantSettings,id:string):Promise<ComputerSession> {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error('Invalid browser session.');
  return sessionSchema.parse(await request(settings,`sessions/${id}/cancel`,'POST',{}));
}
export async function stageCanvasMirror(settings:AssistantSettings,snapshot:CanvasSnapshot,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const pages=await hydrateCanvasMirrorPages(snapshot,signal);
  const captured=await hydrateCanvasMirrorAssignments(pages, file => assistantRequest(validateBackendUrl(settings.backendUrl), '/api/v1/assistant/materials/extract', 'POST', file), signal);
  signal?.throwIfAborted();
  const styles=getComputedStyle(document.documentElement);
  const navigation=document.querySelector('#header, .ic-app-header');
  const nav=navigation?getComputedStyle(navigation):null;
  const theme={primary:styles.getPropertyValue('--ic-brand-primary').trim(),navigation:styles.getPropertyValue('--ic-brand-global-nav-bgd').trim()||nav?.backgroundColor||'',navigationText:styles.getPropertyValue('--ic-brand-global-nav-menu-item__text-color').trim(),fontFamily:getComputedStyle(document.body).fontFamily};
  return z.object({id:z.string(),status:z.literal('staged'),courseCount:z.number(),assignmentCount:z.number(),message:z.string(),command:z.string(),limitations:z.array(z.string())}).parse(await request(settings,'mirror','POST',{...captured,theme}));
}
