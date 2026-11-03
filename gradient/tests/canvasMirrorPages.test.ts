import {afterEach,describe,expect,it,vi} from 'vitest';
import type {CanvasSnapshot} from '../extension/liveCanvas.js';
import {hydrateCanvasMirrorPages} from '../extension/canvasMirrorPages.js';

const origin='https://usm.instructure.com';
function snapshot(resources:any[]):CanvasSnapshot {
  return {origin,syncedAt:'',user:{id:'1',name:'Student',shortName:'S'},issues:[],courses:[{id:'2',resources}]} as unknown as CanvasSnapshot;
}
afterEach(()=>vi.unstubAllGlobals());
describe('Explicit Canvas page staging',()=>{
  it('copies unlocked discovered page bodies once, with cookie-authenticated read-only requests',async()=>{
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response(JSON.stringify({body:'<p>Original guide with a formula.</p>',published:true})));
    vi.stubGlobal('fetch',fetch);
    const input=snapshot([{id:'1',type:'page',title:'Guide',url:origin+'/courses/2/pages/guide'},{id:'3',type:'page',title:'Guide duplicate',url:origin+'/courses/2/pages/guide'}]);
    const output=await hydrateCanvasMirrorPages(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(origin+'/api/v1/courses/2/pages/guide');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({method:'GET',credentials:'include',redirect:'error'});
    expect(output.courses[0]?.resources.every(resource=>resource.bodyHtml?.includes('Original guide'))).toBe(true);
    expect((input.courses[0]?.resources[0] as any).bodyHtml).toBeUndefined();
  });
  it('never fetches foreign courses, external pages, known locked pages or file bytes',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const output=await hydrateCanvasMirrorPages(snapshot([
      {id:'1',type:'page',title:'Foreign',url:origin+'/courses/99/pages/foreign'},
      {id:'2',type:'page',title:'External',url:'https://example.com/courses/2/pages/external'},
      {id:'3',type:'page',title:'Locked',url:origin+'/courses/2/pages/locked',locked_for_user:true},
      {id:'4',type:'file',title:'PDF',url:origin+'/courses/2/files/4'},
    ]));
    expect(fetch).not.toHaveBeenCalled();
    expect(output.mirrorWarnings).toHaveLength(4);
    expect(output.courses[0]?.resources.every(resource=>!resource.bodyHtml)).toBe(true);
  });
  it('reports server-hidden material and oversized pages without copying their content',async()=>{
    const fetch=vi.fn(async(url:string)=>url.endsWith('/hidden')?new Response(JSON.stringify({body:'secret',hidden_for_user:true})):new Response('too large',{headers:{'Content-Length':'2000000'}}));
    vi.stubGlobal('fetch',fetch);
    const output=await hydrateCanvasMirrorPages(snapshot([{id:'1',type:'page',title:'Hidden',url:origin+'/courses/2/pages/hidden'},{id:'2',type:'page',title:'Large',url:origin+'/courses/2/pages/large'}]));
    expect(output.mirrorWarnings).toHaveLength(2);
    expect(output.courses[0]?.resources.every(resource=>!resource.bodyHtml)).toBe(true);
  });
});
