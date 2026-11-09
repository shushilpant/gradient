import {afterEach,describe,expect,it,vi} from 'vitest';
import {readCanvasFileInTab} from '../extension/sourceCanvasTab.js';
const origin='https://usm.instructure.com';
const input={origin,courseId:'126231',resource:{title:'CE 240 Homework 5 Fall 2026.pdf',url:origin+'/courses/126231/files/13845103?wrap=1'}};
const file={title:input.resource.title,mimeType:'application/pdf',data:btoa('%PDF-1.4 real bytes')};
function browser(tabs:any[]=[{id:4,windowId:2,incognito:false,status:'complete',url:origin+'/courses/126231'}]){
  const api={tabs:{query:vi.fn(async()=>tabs),create:vi.fn(async()=>({id:9,windowId:2,incognito:false,status:'complete',url:origin+'/courses/126231'})),get:vi.fn(),remove:vi.fn(async()=>{})},scripting:{executeScript:vi.fn<any>(async()=>[{result:file}])}};
  vi.stubGlobal('chrome',api);return api;
}
afterEach(()=>vi.unstubAllGlobals());
describe('Original Canvas first-party tab reader',()=>{
 it('reads in an existing same-profile source tab without worker-authenticated fetches',async()=>{
  const api=browser();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect(await readCanvasFileInTab(input,{windowId:2,incognito:false})).toEqual(file);
  expect(api.scripting.executeScript.mock.calls[0]?.[0]).toMatchObject({target:{tabId:4,frameIds:[0]},world:'ISOLATED',args:[origin,'13845103',input.resource.title]});
  expect(fetch).not.toHaveBeenCalled();expect(api.tabs.remove).not.toHaveBeenCalled();
 });
 it('selects matching incognito context and prefers the workflow window',async()=>{
  const api=browser([{id:1,windowId:2,incognito:true,status:'complete',url:origin+'/'},{id:2,windowId:7,incognito:false,status:'complete',url:origin+'/'},{id:3,windowId:2,incognito:false,status:'complete',url:origin+'/courses/126231'}]);
  await readCanvasFileInTab(input,{windowId:2,incognito:false});
  expect(api.scripting.executeScript.mock.calls[0]?.[0]).toMatchObject({target:{tabId:3}});
 });
 it('creates an inactive first-party tab and closes only its successful temporary tab',async()=>{
  const api=browser([]);await readCanvasFileInTab(input,{windowId:2,incognito:false});
  expect(api.tabs.create).toHaveBeenCalledWith({url:origin+'/courses/126231',active:false,windowId:2});
  expect(api.tabs.remove).toHaveBeenCalledWith(9);
 });
 it('leaves a source tab available when signing in is needed',async()=>{
  const api=browser([]);api.scripting.executeScript.mockRejectedValue(new Error('Open the original Canvas tab and finish signing in, then retry this workflow.'));
  await expect(readCanvasFileInTab(input,{windowId:2,incognito:false})).rejects.toThrow('finish signing in');
  expect(api.tabs.remove).not.toHaveBeenCalled();
 });
 it('does not create normal-profile tabs for an unidentified incognito window',async()=>{
  const api=browser([]);await expect(readCanvasFileInTab(input,{incognito:true})).rejects.toThrow('signing in');expect(api.tabs.create).not.toHaveBeenCalled();
 });
 it('does not fetch after the source tab navigates to another origin',async()=>{
  const api=browser();vi.stubGlobal('location',{origin:'https://login.example'});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  api.scripting.executeScript.mockImplementation(async(options:any)=>[{result:await options.func(...options.args)}]);
  await expect(readCanvasFileInTab(input,{incognito:false})).rejects.toThrow('signing in');expect(fetch).not.toHaveBeenCalled();
 });
 it('does not execute a reader in a newly opened SSO redirect tab',async()=>{
  const api=browser([]);api.tabs.create.mockResolvedValue({id:9,windowId:2,incognito:false,status:'complete',url:'https://login.example/sso'});
  await expect(readCanvasFileInTab(input,{windowId:2,incognito:false})).rejects.toThrow('signing in');expect(api.scripting.executeScript).not.toHaveBeenCalled();expect(api.tabs.remove).not.toHaveBeenCalled();
 });
 it('the injected reader makes a first-party metadata GET and rejects401',async()=>{
  const api=browser();vi.stubGlobal('location',{origin});const fetch=vi.fn(async()=>new Response('',{status:401}));vi.stubGlobal('fetch',fetch);
  api.scripting.executeScript.mockImplementation(async(options:any)=>[{result:await options.func(...options.args)}]);
  await expect(readCanvasFileInTab(input,{incognito:false})).rejects.toThrow('signing in');
  expect(fetch).toHaveBeenCalledWith(origin+'/api/v1/files/13845103',expect.objectContaining({method:'GET',credentials:'include'}));
 });
 it('the injected reader returns PDF bytes after successful same-origin reads',async()=>{
  const api=browser();vi.stubGlobal('location',{origin});
  const fetch=vi.fn(async(url:string)=>url.includes('/api/v1/')?new Response(JSON.stringify({display_name:input.resource.title,url:origin+'/files/13845103/download','content-type':'application/pdf'})):new Response('%PDF-1.4 real bytes',{headers:{'Content-Type':'application/pdf'}}));vi.stubGlobal('fetch',fetch);
  api.scripting.executeScript.mockImplementation(async(options:any)=>[{result:await options.func(...options.args)}]);
  expect(await readCanvasFileInTab(input,{incognito:false})).toEqual(file);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('downloads returned signed public URLs without Canvas cookies',async()=>{
  const api=browser();api.scripting.executeScript.mockResolvedValue([{result:{title:file.title,mimeType:file.mimeType,downloadUrl:'https://files.instructure.com/signed.pdf?token=example'}}]);
  const fetch=vi.fn(async()=>new Response('%PDF-1.4 real bytes',{headers:{'Content-Type':'application/pdf'}}));vi.stubGlobal('fetch',fetch);
  expect(await readCanvasFileInTab(input,{incognito:false})).toEqual(file);
  expect(fetch).toHaveBeenCalledWith('https://files.instructure.com/signed.pdf?token=example',expect.objectContaining({method:'GET',credentials:'omit'}));
 });
 it('rejects HTML login responses instead of treating them as attachments',async()=>{
  const api=browser();vi.stubGlobal('location',{origin});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/api/v1/')?new Response(JSON.stringify({url:origin+'/files/13845103/download'})):new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}})));
  api.scripting.executeScript.mockImplementation(async(options:any)=>[{result:await options.func(...options.args)}]);
  await expect(readCanvasFileInTab(input,{incognito:false})).rejects.toThrow('signing in');
 });
});
