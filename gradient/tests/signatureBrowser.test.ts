import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {Browser} from 'playwright';
import {launchBrowser,mockCanvas} from './browserHarness.js';
describe('Signature demo flows',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await launchBrowser();});afterAll(async()=>{await browser?.close();});
 it('updates the GPA chart locally and explains the grade with actual group math',async()=>{
  const {page,requests}=await mockCanvas(browser,{legacy:true,fixedTime:'2026-11-05T15:00:00Z'});page.setDefaultTimeout(6000);
  try{
   await page.getByRole('button',{name:/^Grade lab/}).click();
   const chart=page.getByRole('img',{name:/Modeled GPA fan chart/});await chart.waitFor();
   const before=await chart.getAttribute('aria-label');const count=requests.length;
   await page.getByRole('slider',{name:/Study hours for/}).first().evaluate((element:HTMLInputElement)=>{element.value='24';element.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForFunction(old=>{const host=document.querySelector('#gradient-panel-host')?.shadowRoot;return host?.querySelector('.gl-chart')?.getAttribute('aria-label')!==old;},before);
   expect(requests.length).toBe(count);
   const contributions=page.getByLabel('Grade contribution waterfall');await contributions.waitFor();
   await contributions.locator('summary').first().click();
   expect(await contributions.innerText()).toContain('counted points');
   expect(await page.getByText(/Current grade excludes unposted/).innerText()).toContain('separate calculation');
   await page.screenshot({path:'/tmp/gradient-grade-lab.png'});
   await page.locator('.jc-area').evaluate(element=>element.scrollTop=0);
   await page.screenshot({path:'/tmp/gradient-gpa-fan.png'});
  }finally{await page.close();}
 },20000);
 it('requires transcription review before photo critique and supports typed work',async()=>{
  const {page}=await mockCanvas(browser, { legacy: true });page.setDefaultTimeout(6000);let phase='';
  await page.route('**/api/v1/assistant/**',route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(new URL(route.request().url()).pathname.endsWith('/jobs')){phase=route.request().postDataJSON().request.phase;return route.fulfill({headers,json:{id:'photo-test'}});}
   return route.fulfill({headers,json:{status:'complete',result:{transcription:'I scanned the array once, so the running time is O(n).',uncertainties:[],warnings:['Check every equation.'],critique:phase==='critique'?{feedbackSummary:'Explain the stopping condition.',rewriteCheckPassed:true,criteria:[{criterionDescription:'Reasoning',readinessLevel:'Developing',evidenceQuotes:['I scanned the array once'],whatWouldRaiseIt:'Justify the bound.'}]}:null}}});
  });
  try{
   await page.getByRole('button',{name:/^Photo check/}).click();
   expect(await page.getByRole('button',{name:'Check against rubric',exact:true}).isDisabled()).toBe(true);
   await page.getByRole('checkbox',{name:/This is my ordinary homework/}).check();
   const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=300;const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,800,300);context.fillStyle='black';context.font='28px sans-serif';context.fillText('I scanned the array once: O(n).',30,90);return canvas.toDataURL('image/png').split(',')[1]!;});
   await page.getByLabel('Upload homework photo',{exact:true}).setInputFiles({name:'homework.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
   await page.getByRole('img',{name:'Your handwritten homework',exact:true}).waitFor();
   await page.getByRole('button',{name:'Read handwriting',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#gradient-panel-host')?.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Confirmed homework transcription"]')?.value.includes('scanned'));
   expect(phase).toBe('read');
   await page.getByRole('textbox',{name:'Confirmed homework transcription'}).fill('I scanned the array once, so the running time is O(n).');
   expect(await page.getByRole('button',{name:'Check against rubric',exact:true}).isDisabled()).toBe(true);
   await page.getByRole('checkbox',{name:/I checked this transcription/}).check();
   await page.getByRole('button',{name:'Check against rubric',exact:true}).click();
   await page.getByRole('region',{name:'Photo critique'}).waitFor();expect(phase).toBe('critique');
   expect(await page.getByRole('region',{name:'Photo critique'}).innerText()).toContain('Justify the bound.');
  }finally{await page.close();}
 },15000);
 it('opens cited evidence and produces a revocable QR code for a generated packet',async()=>{
  const {page}=await mockCanvas(browser, { legacy: true });page.setDefaultTimeout(6000);let revoked=false;
  await page.route('**/api/v1/assistant/**',route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};const path=new URL(route.request().url()).pathname;
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(path.endsWith('/health'))return route.fulfill({headers,json:{ok:true,ollamaConnected:true,models:['gpt-oss:20b']}});
   if(path.endsWith('/revoke')){revoked=true;return route.fulfill({headers,json:{revoked:true}});}
   if(path.endsWith('/shares'))return route.fulfill({headers,json:{token:'a'.repeat(32),url:'http://192.168.1.2:8767/p/'+'a'.repeat(32),expiresInSeconds:1200}});
   if(path.endsWith('/jobs'))return route.fulfill({headers,json:{id:'packet-test'}});
   return route.fulfill({headers,json:{status:'complete',result:{title:'Graph revision',summary:'A source-grounded guide.',markdown:'Graphs contain nodes and edges. [S1]',sampleMarkdown:'',sources:[{id:'S1',title:'Lecture notes',url:'https://canvas.instructure.com/courses/99001/pages/graphs',excerpt:'A graph contains vertices and edges.'}],diagrams:[],graphs:[],images:[],warnings:[]}}});
  });
  try{
   await page.getByRole('button',{name:/^Command center/}).click();
   await page.getByRole('textbox',{name:'Your command',exact:true}).fill('Prepare me for my next deadline in 40 minutes');
   await page.getByRole('button',{name:/Run command/}).click();
   const reference=page.getByRole('button',{name:'Show evidence S1: Lecture notes'});await reference.waitFor();await reference.focus();
   expect(await page.getByRole('region',{name:'Evidence S1',exact:true}).innerText()).toContain('A graph contains vertices and edges.');
   await page.screenshot({path:'/tmp/gradient-provenance.png'});
   await page.getByRole('button',{name:'Share packet to phone',exact:true}).click();
   await page.getByRole('img',{name:'Scan to open this study packet on your phone'}).waitFor();
   expect(await page.getByRole('img',{name:'Scan to open this study packet on your phone'}).getAttribute('src')).toMatch(/^data:image\/png/);
   await page.getByRole('button',{name:'Revoke phone link',exact:true}).click();expect(revoked).toBe(true);
  }finally{await page.close();}
 },20000);
});
