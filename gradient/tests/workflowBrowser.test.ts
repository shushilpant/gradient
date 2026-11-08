import {it,expect} from 'vitest';
import type {Page} from 'playwright';
import {launchBrowser,mockCanvas,waitForLoaded} from './browserHarness.js';

const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
const config={sandboxOrigin:'http://127.0.0.1:8080',engine:'gradient-browser-agent',isolation:'incognito-local-origin',available:true,browserAvailable:true,message:'Local Canvas OSS sandbox ready.'};
const id='a'.repeat(32);
const screenshot='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';
const running={id,status:'running',stage:'observing',label:'Reading actual sandbox coursework',steps:[{number:1,action:'observe',url:config.sandboxOrigin+'/courses/1',reason:'Observed the seeded course page.',screenshot}]};
async function openAutomation(page:Page){
  page.setDefaultTimeout(4000);
  await waitForLoaded(page);
  await page.getByRole('tab',{name:'Automation',exact:true}).click();
  await expect.poll(()=>page.getByRole('button',{name:'Recheck',exact:true}).isEnabled()).toBe(true);
  await page.getByRole('button',{name:'Recheck',exact:true}).click();
  await page.getByText('Ready',{exact:true}).waitFor();
}

it('requires approval, starts the existing isolated backend agent, exposes evidence and cancels it',async()=>{
 const browser=await launchBrowser();const {page,requests}=await mockCanvas(browser);
 const starts:Record<string,unknown>[]=[];let cancelled=false;
 try{
  await page.route('http://127.0.0.1:8765/api/v1/computer/**',route=>{
   const request=route.request();const path=new URL(request.url()).pathname;
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(path.endsWith('/config'))return route.fulfill({headers,json:config});
   if(path.endsWith('/cancel')){cancelled=true;return route.fulfill({headers,json:{...running,status:'cancelled',stage:'cancelled',label:'Stopped. No coursework was submitted.'}});}
   if(request.method()==='POST'){starts.push(request.postDataJSON());return route.fulfill({headers,json:running});}
   return route.fulfill({headers,json:cancelled?{...running,status:'cancelled',stage:'cancelled'}:running});
  });
  await openAutomation(page);
  const start=page.getByRole('button',{name:'Start automatic workflow',exact:true});
  expect(await start.isDisabled()).toBe(true);
  const coursework=page.getByLabel('Workflow coursework',{exact:true});
  await coursework.selectOption({index:1});
  expect(await page.getByLabel('Automatic workflow goal',{exact:true}).inputValue()).toContain('LIVE-101');
  await page.getByLabel('I approve this read-only workflow in the local sandbox shown above.').check();
  await start.click();
  await page.getByRole('region',{name:'Browser agent activity',exact:true}).waitFor();
  await page.getByRole('img',{name:'Current agent Canvas page'}).waitFor();
  expect(starts).toHaveLength(1);
  expect(starts[0]).toMatchObject({origin:config.sandboxOrigin,webResearch:true});
  expect(starts[0]?.goal).toContain('local Canvas replica');
  await page.getByRole('button',{name:'Stop run',exact:true}).click();
  await page.getByRole('heading',{name:'Run stopped',exact:true}).waitFor();
  expect(cancelled).toBe(true);
  expect(requests.every(request=>request.method==='GET')).toBe(true);
 }finally{await browser.close();}
},20000);

it('preserves source-grounded reference output and allows recovery after a model error',async()=>{
 const browser=await launchBrowser();const {page}=await mockCanvas(browser);let attempt=0;
 const packet={title:'Sandbox homework reference',summary:'Reference material for review.',markdown:'Read the source [S1].',sampleMarkdown:'## Reference example\n\nA learning example [S1].',sources:[{id:'S1',title:'Seeded course instructions',url:config.sandboxOrigin+'/courses/1/assignments/2',excerpt:'Explain the system response.',kind:'canvas'}],diagrams:[],graphs:[],images:[],warnings:['Check the course policy and unresolved requirements.']};
 try{
  await page.route('http://127.0.0.1:8765/api/v1/computer/**',route=>{
   const request=route.request();const path=new URL(request.url()).pathname;
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(path.endsWith('/config'))return route.fulfill({headers,json:config});
   if(request.method()==='POST')attempt++;
   return route.fulfill({headers,json:attempt===1?{...running,status:'error',stage:'error',error:'Selected local model unavailable. Choose an installed model in AI Workspace.'}:{...running,status:'complete',stage:'complete',packet}});
  });
  await openAutomation(page);
  await page.getByLabel('I approve this read-only workflow in the local sandbox shown above.').check();
  await page.getByRole('button',{name:'Start automatic workflow',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Selected local model unavailable'}).waitFor();
  expect(await page.getByRole('region',{name:'Automatic reference sample',exact:true}).count()).toBe(0);
  await page.getByLabel('I approve this read-only workflow in the local sandbox shown above.').check();
  await page.getByRole('button',{name:'Start automatic workflow',exact:true}).click();
  await page.getByRole('heading',{name:packet.title,exact:true}).waitFor();
  await page.getByRole('button',{name:'Show evidence S1: Seeded course instructions',exact:true}).first().click();
  expect(await page.getByRole('region',{name:'Evidence S1',exact:true}).first().innerText()).toContain('Explain the system response.');
  await page.getByRole('heading',{name:'AI-generated reference material',exact:true}).waitFor();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export illustrated sample',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/reference\.html$/);
 }finally{await browser.close();}
},20000);

it('requires local-copy approval and cancels page capture before staging a live snapshot',async()=>{
 const browser=await launchBrowser();const {page}=await mockCanvas(browser);let reads=0;let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});const copies:Record<string,any>[]=[];
 try{
  await page.route('https://canvas.instructure.com/api/v1/courses/*/pages/*',async route=>{
   reads++;if(reads===1)await gate;
   await route.fulfill({json:{published:true,body:'<p>Course study guide.</p>'}}).catch(()=>{});
  });
  await page.route('http://127.0.0.1:8765/api/v1/computer/**',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(route.request().url().endsWith('/config'))return route.fulfill({headers,json:config});
   copies.push(route.request().postDataJSON());
   return route.fulfill({headers,json:{id:'copy',status:'staged',courseCount:4,assignmentCount:12,message:'Approved coursework copy staged locally.',command:'python3 sandbox/canvas_local/setup.py import --snapshot local-copy.json',limitations:['File links remain references.']}});
  });
  await openAutomation(page);
  const stage=page.getByRole('button',{name:'Stage my Canvas courses',exact:true});
  expect(await stage.isDisabled()).toBe(true);
  const approval=page.getByLabel('I approve copying my visible Canvas coursework to the local replica.');
  await approval.check();await stage.click();
  await expect.poll(()=>reads).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Cancel staging',exact:true}).click();release();
  await page.waitForTimeout(150);
  expect(copies).toHaveLength(0);
  await approval.check();await stage.click();
  await page.getByText('Approved coursework copy staged locally.',{exact:true}).waitFor();
  expect(copies).toHaveLength(1);
  expect(copies[0]?.origin).toBe('https://canvas.instructure.com');
  expect(copies[0]?.cookies).toBeUndefined();
 }finally{release();await browser.close();}
},20000);
