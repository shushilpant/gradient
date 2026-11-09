import { beforeAll, afterAll, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from './browserHarness.js';

const origin = 'http://127.0.0.1:8080';
const backend = 'http://127.0.0.1:8765';
const filename = 'CE 240 Homework 5 Fall 2026.pdf';
const questions = 'Question 1: Find the inverse Laplace transform of F(s) = 1/(s+2). Show the partial fraction calculations.';
const sourceUrl = 'https://usm.instructure.com/courses/126231/files/13845103?wrap=1';
const packet = {title:'Inverse Laplace reference',summary:'Read the actual questions.',markdown:'Use the supplied instructions.',sampleMarkdown:'A reference for the supplied problem.',sources:[],diagrams:[],graphs:[],images:[],warnings:[]};
const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
const script = buildSync({stdin:{contents:"import {generateStudyPacket} from './extension/assistantClient.ts'; import {getActiveAcademicContext} from './extension/academicContext.ts'; import {startPageAutopilot} from './extension/pageAutopilot.ts'; import {getPageAutomation} from './extension/pageAutomation.ts'; Object.assign(window,{generateStudyPacket,getActiveAcademicContext,startPageAutopilot,getPageAutomation});",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',jsxImportSource:'preact'}).outputFiles![0]!.text;
let browser: Browser;
beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser?.close(); });

function request(html: string, resources: Array<{title:string;url:string}> = []) {
  return {autopilot:true,assignmentKind:'homework',course:{id:'10',name:'Engineering mathematics',code:'CE 240 H001'},assignment:{id:'5',title:'Homework 5 - Inverse Laplace Transformation',description:filename,descriptionHtml:html,url:origin+'/courses/10/assignments/5',dueAt:null},prompt:'Read every problem and prepare a reference.',level:'all_in',mode:'sample',model:'gpt-oss:20b',webResearch:false,resources};
}
async function setup() {
  const page = await browser.newPage();
  const jobs: any[] = [];
  const extractions: any[] = [];
  await page.route(origin+'/**', route => route.fulfill({contentType:'text/html',body:'<main>Assignment</main>'}));
  await page.route(backend+'/**', route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method()==='OPTIONS') return route.fulfill({status:204,headers});
    if (path.endsWith('/materials/extract')) {extractions.push(req.postDataJSON()); return route.fulfill({headers,json:{text:questions,warnings:[]}});}
    if (path.endsWith('/jobs') && req.method()==='POST') {jobs.push(req.postDataJSON()); return route.fulfill({headers,json:{id:'assignment-generation'}});}
    if (path.endsWith('/jobs/assignment-generation')) return route.fulfill({headers,json:{status:'complete',result:packet}});
    return route.abort();
  });
  await page.addInitScript(script);
  await page.goto(origin+'/courses/10/assignments/5');
  expect(await page.evaluate(() => (window as any).getActiveAcademicContext())).toBeNull();
  return {page,jobs,extractions};
}
async function generate(page: Page, input: ReturnType<typeof request>) {
  return page.evaluate(async input => {
    try {
      const result = await (window as any).generateStudyPacket({backendUrl:'http://127.0.0.1:8765',reasoningModel:'gpt-oss:20b',visionModel:'gemma4:e4b',detailLevel:'all_in',webResearch:false},input);
      return {title:result.title,error:null};
    } catch (error) {return {title:null,error:String(error)};}
  }, input);
}

it('reads the assignment PDF ahead of more than twelve unrelated resources without UI context', async () => {
  const {page,jobs,extractions} = await setup();
  try {
    await page.route(origin+'/api/v1/files/100', route => route.fulfill({json:{display_name:filename,'content-type':'application/pdf',url:origin+'/files/100/download'}}));
    await page.route(origin+'/files/100/download', route => route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.7 fixture supplied to mocked local extractor')}));
    await page.route(origin+'/api/v1/files/2*', route => route.fulfill({status:403,json:{errors:['unavailable']}}));
    const resources = Array.from({length:15},(_,i)=>({title:'Unrelated lecture '+i,url:origin+'/courses/10/files/'+(200+i)}));
    resources.push({title:filename,url:origin+'/courses/10/files/100'});
    const result = await generate(page,request(`<p><a href="/courses/10/files/100?wrap=1">${filename}</a></p>`,resources));
    expect(result.error).toBeNull();
    expect(extractions).toHaveLength(1);
    expect(extractions[0].title).toBe(filename);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].request.resources[0].text).toBe(questions);
    expect(jobs[0].request.assignment).not.toHaveProperty('descriptionHtml');
  } finally {await page.close();}
});

it('reads an original production Canvas PDF for an existing local mirror before generation', async () => {
  const {page,jobs} = await setup();
  try {
    await page.evaluate(({sourceUrl,questions,filename})=>{
      const w = window as any; w.__sourceRequests=[];
      const chrome = w.chrome || {};
      chrome.runtime={sendMessage:async(message:any)=>{
        if(message.type==='OFFCANVAS_READ_SOURCE_MATERIALS') {w.__sourceRequests.push(message);return {ok:true,data:{resources:[{title:filename,url:sourceUrl,text:questions}],warnings:[]}};}
        if(message.type==='OFFCANVAS_ASSISTANT_REQUEST') {const response=await fetch(message.backendUrl+message.path,{method:message.method,headers:{'Content-Type':'application/json'},body:message.method==='POST'?JSON.stringify(message.body):undefined});return {ok:response.ok,data:await response.json()};}
        throw new Error('Unexpected extension operation');
      }};
      if(!w.chrome)Object.defineProperty(window,'chrome',{value:chrome,configurable:true});
    },{sourceUrl,questions,filename});
    const result = await generate(page,request(`<p><a href="${sourceUrl}">${filename}</a></p>`));
    expect(result.error).toBeNull();
    const sourceRequests = await page.evaluate(()=>(window as any).__sourceRequests);
    expect(sourceRequests).toHaveLength(1);
    expect(sourceRequests[0].resources).toEqual([{title:filename,url:sourceUrl}]);
    expect(jobs[0].request.resources[0].text).toBe(questions);
  } finally {await page.close();}
});

it('stops before generation when a linked instruction PDF cannot be read', async () => {
  const {page,jobs} = await setup();
  try {
    await page.route(origin+'/api/v1/files/100', route => route.fulfill({status:403,json:{errors:['not available']}}));
    const result = await generate(page,request(`<p><a href="/courses/10/files/100?wrap=1">${filename}</a></p>`));
    expect(result.error).toContain(filename);
    expect(result.error).toContain('No reference draft was generated');
    expect(jobs).toHaveLength(0);
  } finally {await page.close();}
});

it('uses captured mirrored instruction text without refetching the original PDF', async () => {
  const {page,jobs} = await setup();
  try {
    const html = `<p><a href="${sourceUrl}">${filename}</a></p><section data-offcanvas-assignment-source="${sourceUrl.replace('?wrap=1','')}"><h3>Extracted assignment instructions</h3><pre>${questions}</pre></section>`;
    const input = request(html); input.assignment.description = filename+'\n'+questions;
    const result = await generate(page,input);
    expect(result.error).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].request.assignment.description).toContain(questions);
  } finally {await page.close();}
});


it('the automatic workflow carries the fresh assignment PDF into generation before workspace sync', async () => {
  const {page,jobs,extractions} = await setup();
  try {
    await page.route(origin+'/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      if(path==='/api/v1/users/self/profile') return route.fulfill({json:{id:12,name:'Student'}});
      if(path==='/api/v1/courses') return route.fulfill({json:[{id:10,name:'Engineering mathematics',course_code:'CE 240 H001',enrollments:[{type:'student',enrollment_state:'active'}]}]});
      if(path==='/api/v1/courses/10/assignment_groups') return route.fulfill({json:[{id:1,name:'Homework',group_weight:100}]});
      if(path==='/api/v1/courses/10/assignments') return route.fulfill({json:[{id:5,assignment_group_id:1,name:'Homework 5 - Inverse Laplace Transformation',description:`<p><a href="/courses/10/files/100?wrap=1">${filename}</a></p>`,points_possible:10,submission_types:['online_upload']}]});
      if(path==='/api/v1/courses/10/files') return route.fulfill({json:[...Array.from({length:15},(_,i)=>({id:200+i,display_name:'Unrelated lecture '+i})),{id:100,display_name:filename}]});
      if(path==='/api/v1/files/100') return route.fulfill({json:{display_name:filename,'content-type':'application/pdf',url:origin+'/files/100/download'}});
      if(/^\/api\/v1\/files\/2/.test(path)) return route.fulfill({status:403,json:{errors:['unavailable']}});
      return route.fulfill({json:[]});
    });
    await page.route(origin+'/files/100/download', route => route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.7 mocked extractor input')}));
    await page.evaluate(()=>{(window as any).startPageAutopilot('Read every problem and prepare a complete learning reference.',{backendUrl:'http://127.0.0.1:8765',reasoningModel:'gpt-oss:20b',visionModel:'gemma4:e4b',detailLevel:'all_in',webResearch:false},{courseId:'10',assignmentId:'5'},'12');});
    await expect.poll(()=>page.evaluate(()=>(window as any).getPageAutomation()?.status)).toBe('complete');
    expect(extractions).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].request.resources[0].text).toBe(questions);
    expect(jobs[0].request.assignment).not.toHaveProperty('descriptionHtml');
    expect(await page.evaluate(()=>(window as any).getActiveAcademicContext())).toBeNull();
  } finally {await page.close();}
});

it('keeps every original instruction attachment ahead of unrelated local materials', async () => {
  const {page,jobs} = await setup();
  const originals = Array.from({length:4},(_,i)=>({title:`Homework instructions part ${i+1}.pdf`,url:`https://usm.instructure.com/courses/126231/files/${13845103+i}?wrap=1`,text:`Required problem ${i+1}: calculate the inverse Laplace transform and show the steps.`}));
  try {
    await page.route(origin+'/api/v1/courses/10/pages/*', route => route.fulfill({json:{title:'Unrelated lecture',body:'<p>Background lecture notes.</p>',published:true}}));
    await page.evaluate(originals=>{
      const w = window as any; const chrome = w.chrome || {};
      chrome.runtime={sendMessage:async(message:any)=>{
        if(message.type==='OFFCANVAS_READ_SOURCE_MATERIALS') return {ok:true,data:{resources:originals,warnings:[]}};
        if(message.type==='OFFCANVAS_ASSISTANT_REQUEST') {const response=await fetch(message.backendUrl+message.path,{method:message.method,headers:{'Content-Type':'application/json'},body:message.method==='POST'?JSON.stringify(message.body):undefined});return {ok:response.ok,data:await response.json()};}
        throw new Error('Unexpected extension operation');
      }};
      if(!w.chrome)Object.defineProperty(window,'chrome',{value:chrome,configurable:true});
    },originals);
    const html = originals.map(source=>`<p><a href="${source.url}">${source.title}</a></p>`).join('');
    const resources = Array.from({length:15},(_,i)=>({title:'Unrelated lecture '+i,url:origin+'/courses/10/pages/lecture-'+i}));
    const result = await generate(page,request(html,resources));
    expect(result.error).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].request.resources).toHaveLength(16);
    expect(jobs[0].request.resources.slice(0,4).map((resource:any)=>resource.text)).toEqual(originals.map(source=>source.text));
    expect(jobs[0].request.resources.slice(0,4).map((resource:any)=>resource.title)).toEqual(originals.map(source=>source.title));
  } finally {await page.close();}
});
