import {afterAll,beforeAll,expect,it} from 'vitest';
import {buildSync} from 'esbuild';
import type {Browser} from 'playwright';
import {launchBrowser} from './browserHarness.js';
const origin='https://usm.instructure.com';
const backend='http://127.0.0.1:8765';
const driver=buildSync({stdin:{contents:"import {readSourceCanvasMaterials} from './extension/sourceCanvasMaterials.ts'; Object.assign(window,{readSourceCanvasMaterials});",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'}).outputFiles![0]!.text;
let browser:Browser;
beforeAll(async()=>{browser=await launchBrowser();});
afterAll(async()=>{await browser?.close();});
it('reads the real serialized tab reader with a first-party session when worker requests are unauthorized',async()=>{
 const context=await browser.newContext();const page=await context.newPage();const calls:string[]=[];let extracted:any;
 try{
  await context.addCookies([{name:'canvas_session',value:'fixture-session',url:origin,sameSite:'Strict',secure:true}]);
  await page.route(origin+'/**',r=>r.fulfill({contentType:'text/html',body:'<main>Signed-in Canvas course</main>'}));
  await page.route(origin+'/api/v1/files/13845103',r=>{
   calls.push('metadata');expect(r.request().headers().cookie).toContain('canvas_session=fixture-session');
   return r.fulfill({json:{display_name:'CE 240 Homework 5 Fall 2026.pdf','content-type':'application/pdf',url:origin+'/files/13845103/download'}});
  });
  await page.route(origin+'/files/13845103/download',r=>{
   calls.push('download');expect(r.request().headers().cookie).toContain('canvas_session=fixture-session');
   return r.fulfill({contentType:'application/pdf',body:'%PDF-1.4 First-party authenticated homework bytes'});
  });
  await page.route(backend+'/**',r=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'};
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
   extracted=r.request().postDataJSON();return r.fulfill({headers,json:{text:'1. Calculate the inverse Laplace transform of F(s)=1/(s+2).',warnings:[]}});
  });
  await page.goto(origin+'/courses/126231');
  await page.evaluate(()=>{
   const nativeFetch=window.fetch.bind(window);const w=window as any;w.__insideSourceTab=false;w.__workerAuthAttempts=0;
   window.fetch=async(input,options)=>{
    if(String(input).startsWith('https://usm.instructure.com')&&!w.__insideSourceTab){w.__workerAuthAttempts++;return new Response('{}',{status:401});}
    return nativeFetch(input,options);
   };
   const mock={tabs:{query:async()=>[{id:7,url:location.href,status:'complete',windowId:2,incognito:false}]},scripting:{executeScript:async(options:any)=>{
    w.__insideSourceTab=true;
    try{const detached=(0,eval)('('+options.func.toString()+')');return [{result:await detached(...options.args)}];}
    finally{w.__insideSourceTab=false;}
   }}};
   Object.defineProperty(window,'chrome',{value:mock,configurable:true});
  });
  await page.addScriptTag({content:driver});
  const result=await page.evaluate(()=> (window as any).readSourceCanvasMaterials({backendUrl:'http://127.0.0.1:8765',resources:[{title:'CE 240 Homework 5 Fall 2026.pdf',url:'https://usm.instructure.com/courses/126231/files/13845103?wrap=1'}]},'http://127.0.0.1:8080/courses/2/assignments/5',{windowId:2,incognito:false}));
  expect(result.warnings).toEqual([]);expect(result.resources[0].text).toContain('inverse Laplace');
  expect(calls).toEqual(['metadata','download']);
  expect(await page.evaluate(()=>(window as any).__workerAuthAttempts)).toBe(0);
  expect(Buffer.from(extracted.data,'base64').toString()).toContain('First-party authenticated homework bytes');
  expect(extracted).not.toHaveProperty('cookies');
 }finally{await context.close();}
},20000);
