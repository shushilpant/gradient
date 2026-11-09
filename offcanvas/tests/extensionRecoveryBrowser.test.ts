import {it,expect} from 'vitest';
import {buildSync} from 'esbuild';
import {launchBrowser} from './browserHarness.js';

for (const repeat of [false,true]) it(repeat?'stops reconnecting after one failed refresh':'resumes the approved workflow after extension invalidation',async()=>{
 const browser=await launchBrowser();const page=await browser.newPage();let visits=0;
 try {
  const script=buildSync({stdin:{contents:`import {beginPageAutomation,resumePageAutomation,finishPageAutomation,getPageAutomation} from './extension/pageAutomation.ts';
  const resume=()=>resumePageAutomation('workflow',async(run)=>{
    const attempts=Number(sessionStorage.getItem('testAttempts')||0)+1;sessionStorage.setItem('testAttempts',String(attempts));
    if(${repeat}||attempts===1)throw new Error('Extension context invalidated.');
    if(run.data.target!=='selected-homework')throw new Error('Lost the target');
    finishPageAutomation(run,{title:'Recovered',summary:'',markdown:'Read',sampleMarkdown:'Sample',sources:[],diagrams:[],graphs:[],images:[],warnings:[]},'Recovered workflow');
  });
  Object.assign(window,{getPageAutomation,startRecovery:()=>{beginPageAutomation('workflow',{target:'selected-homework'},'Starting');void resume();}});
  document.addEventListener('DOMContentLoaded',()=>void resume());`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'}).outputFiles![0]!.text;
  await page.route('http://127.0.0.1:8080/**',route=>{visits++;return route.fulfill({contentType:'text/html',body:'<main>Canvas homework</main>'});});
  await page.addInitScript(script);await page.goto('http://127.0.0.1:8080/courses/1/assignments/2');
  await page.evaluate(()=>(window as any).startRecovery());
  await expect.poll(()=>page.evaluate(()=>(window as any).getPageAutomation()?.status)).toBe(repeat?'error':'complete');
  expect(visits).toBe(2);
  expect(await page.evaluate(()=>Number(sessionStorage.getItem('testAttempts')))).toBe(2);
  if(repeat)expect(await page.evaluate(()=>(window as any).getPageAutomation().error)).toContain('Refresh this Canvas page');
 }finally{await browser.close();}
},15000);
