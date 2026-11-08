import {it,expect} from 'vitest';
import {buildSync} from 'esbuild';
import {launchBrowser} from './browserHarness.js';

// The tab-driving path is retained for legacy use but is outside primary navigation.
const legacy=()=>buildSync({stdin:{contents:"import {startPageAutopilot,resumePageAutopilot} from './extension/pageAutopilot.ts'; Object.assign(window,{legacyStart:startPageAutopilot,legacyResume:resumePageAutopilot}); void resumePageAutopilot();",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',jsxImportSource:'preact'}).outputFiles![0]!.text;
it('legacy navigation uses observed links and stop prevents pending navigation',async()=>{
 const browser=await launchBrowser();const page=await browser.newPage();let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});let polls=0;
 try{page.setDefaultTimeout(4000);
  await page.route('http://127.0.0.1:8080/**',r=>r.fulfill({contentType:'text/html',body:'<main><h1>Canvas coursework</h1><a href="/courses/1">Signals course</a></main>'}));
  await page.route('http://127.0.0.1:8765/**',async r=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
   if(r.request().url().endsWith('/jobs'))return r.fulfill({headers,json:{id:'plan'}});
   polls++;await gate;
   return r.fulfill({headers,json:{status:'complete',result:{summary:'Open course',actions:[{kind:'open',url:'http://127.0.0.1:8080/courses/1',description:'Opening Signals'}],warnings:[]}}});
  });
  await page.addInitScript(legacy());await page.goto('http://127.0.0.1:8080/');
  await page.evaluate(()=>(window as any).legacyStart('Read the next homework'));
  await expect.poll(()=>polls).toBe(1);
  await page.getByRole('button',{name:'Stop Auto',exact:true}).click();release();
  await page.waitForTimeout(300);
  expect(page.url()).toBe('http://127.0.0.1:8080/');
  expect(await page.evaluate(()=>sessionStorage.getItem('gradient_page_autopilot'))).toBeNull();
 }finally{release();await browser.close();}
},20000);
it('legacy Auto refuses active assessment pages before starting',async()=>{
 const browser=await launchBrowser();const page=await browser.newPage();
 try{
  await page.route('http://127.0.0.1:8080/**',r=>r.fulfill({contentType:'text/html',body:'<main><div id="quiz_timer">Timed assessment</div></main>'}));
  await page.addInitScript(legacy());await page.goto('http://127.0.0.1:8080/courses/1/assignments/2');
  const result=await page.evaluate(()=>{try{(window as any).legacyStart('Read homework');return 'started';}catch(error){return String(error);}});
  expect(result).toContain('unavailable on this assessment');
  expect(await page.evaluate(()=>sessionStorage.getItem('gradient_page_autopilot'))).toBeNull();
 }finally{await browser.close();}
});
