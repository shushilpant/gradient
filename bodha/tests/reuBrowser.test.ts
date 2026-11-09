import { it, expect } from 'vitest';
import type { Page } from 'playwright';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
const opportunity=(title:string,skills:string[]=[])=>({title,url:`https://university.edu/${title.replace(/ /g,'-')}`,matchedTopics:['machine learning'],skills,summary:'Machine learning REU with undergraduate research.',deadlineEvidence:null,eligibilityEvidence:'Undergraduate students',fundingEvidence:null,deadlineSummary:null,eligibilitySummary:'Open to undergraduate students.',fundingSummary:null,status:'Check current application cycle'});
async function mockReuJob(page:Page,result:unknown,onRequest?:(body:unknown)=>void){
 await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs',route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  onRequest?.(route.request().postDataJSON());
  return route.fulfill({headers,json:{id:'reutest',status:'running'}});
 });
 await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs/reutest',route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({headers,json:{status:'complete',result}}));
}
it('finds REUs using topic keywords and the selected local model without sending course data',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);let body:unknown;
  await page.evaluate(()=>localStorage.setItem('gradient_assistant_settings',JSON.stringify({reasoningModel:'qwen3:8b'})));
  await mockReuJob(page,{query:'REU biology',checkedAt:new Date().toISOString(),message:'',opportunities:[{...opportunity('Biology research summer'),matchedTopics:['biology'],applicationUrl:'https://university.edu/apply'}]},request=>{body=request;});
  await page.getByRole('tab',{name:'Research',exact:true}).click();
  await page.getByLabel('REU research topics').fill('biology');
  await page.getByRole('button',{name:'Find REUs',exact:true}).click();
  await page.getByRole('link',{name:'Biology research summer',exact:true}).waitFor();expect(body).toEqual({type:'reu',request:{topics:['biology'],model:'qwen3:8b'}});
  expect(await page.getByRole('link',{name:'Application information from programme page'}).getAttribute('href')).toBe('https://university.edu/apply');
  await page.getByText('Deadline, eligibility & funding',{exact:true}).click();
  expect(await page.getByRole('region',{name:'REU search results'}).innerText()).toContain('Not found on the source page.');
  expect(await page.getByRole('region',{name:'REU search results'}).innerText()).toContain('Current application status is unverified');
 }finally{await browser.close();}
},20000);
it('ranks programme skills and explains matches with relevant enrolled courses only once',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser,{configureData:courses=>{
  courses[0]!.course.syllabus_body='<p>Learning objectives include machine learning with Python.</p>';
  courses[0]!.assignments.forEach((assignment:Record<string,unknown>,index:number)=>{
   assignment.name=`Machine learning assignment ${index+1}`;
   assignment.description='<p>Practice machine learning with Python in this assignment.</p>';
  });
  courses[1]!.course.name='Unrelated history course';courses[1]!.course.course_code='HIST-200';
  courses[1]!.course.syllabus_body='<p>Survey of medieval European history.</p>';
 }});
 try{
  await waitForLoaded(page);
  await mockReuJob(page,{query:'REU',checkedAt:new Date().toISOString(),message:'',opportunities:[opportunity('A general REU'),{...opportunity('Z Python REU',['Python']),skillEvidence:{Python:'Python is used for research.'}}]});
  await page.getByRole('tab',{name:'Research',exact:true}).click();
  await page.getByLabel('REU research topics').fill('machine learning');await page.getByRole('button',{name:'Find REUs',exact:true}).click();
  await page.getByRole('link',{name:'Z Python REU',exact:true}).waitFor();
  const first=page.getByRole('region',{name:'REU search results'}).locator('article').first();
  expect(await first.innerText()).toContain('Z Python REU');expect(await first.innerText()).toContain('Overlap score 3');
  await first.getByText('Why this matches your coursework',{exact:true}).click();
  const explanation=first.locator('details').filter({hasText:'Why this matches your coursework'});
  const text=await explanation.innerText();
  expect(await explanation.getByRole('listitem').count()).toBe(1);
  expect(await explanation.getByText('LIVE-101 · Live Systems Lab',{exact:true}).count()).toBe(1);
  expect(text).toContain('LIVE-101');expect(text).toContain('Live Systems Lab');
  expect(text.toLowerCase()).toContain('machine learning');expect(text).toContain('Python');
  for(const unwanted of ['HIST-200','Unrelated history course','BIO-110','Machine learning assignment','Learning objectives include','Practice machine learning','Programme source excerpt','Python is used for research.'])expect(text).not.toContain(unwanted);
 }finally{await browser.close();}
},20000);
it('shows local-model programme summaries and never falls back to noisy website excerpts',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);
  const raw='NAVIGATION Search Menu Give Directory Privacy Cookies DEADLINE ELIGIBILITY FUNDING';
  const summaries={deadlineSummary:'Applications close February 1, 2027.',eligibilitySummary:'Undergraduate students studying computing may apply.',fundingSummary:'Participants receive a $6,000 stipend and housing.'};
  await mockReuJob(page,{query:'REU',checkedAt:new Date().toISOString(),message:'',opportunities:[
   {...opportunity('Clear summaries'),deadlineEvidence:raw,eligibilityEvidence:raw,fundingEvidence:raw,...summaries},
   {...opportunity('Unavailable summaries'),deadlineEvidence:raw,eligibilityEvidence:raw,fundingEvidence:raw,deadlineSummary:null,eligibilitySummary:null,fundingSummary:null},
  ]});
  await page.getByRole('tab',{name:'Research',exact:true}).click();await page.getByLabel('REU research topics').fill('machine learning');
  await page.getByRole('button',{name:'Find REUs',exact:true}).click();
  await page.getByRole('link',{name:'Clear summaries',exact:true}).waitFor();
  const results=page.getByRole('region',{name:'REU search results'});
  const clear=results.locator('article').filter({has:page.getByRole('link',{name:'Clear summaries',exact:true})});
  await clear.getByText('Deadline, eligibility & funding',{exact:true}).click();
  const details=clear.locator('details').filter({hasText:'Deadline, eligibility & funding'});
  const text=await details.innerText();
  for(const summary of Object.values(summaries))expect(text).toContain(summary);
  expect(text).not.toContain(raw);
  const unavailable=results.locator('article').filter({has:page.getByRole('link',{name:'Unavailable summaries',exact:true})});
  await unavailable.getByText('Deadline, eligibility & funding',{exact:true}).click();
  expect(await unavailable.innerText()).not.toContain(raw);
  expect(await unavailable.getByText('Summary unavailable. Check the programme page.',{exact:true}).count()).toBe(3);
  expect(await unavailable.innerText()).not.toContain('These are source excerpts');
 }finally{await browser.close();}
},20000);
it('ignores a cancelled search response and preserves the editable profile',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);let finish!:()=>Promise<void>;let requested!:()=>void;
  const started=new Promise<void>(resolve=>{requested=resolve;});
  await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs',route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({headers,json:{id:'reutest',status:'running'}}));
  await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs/reutest',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   requested();return new Promise<void>(resolve=>{finish=async()=>{await route.fulfill({headers,json:{status:'complete',result:{query:'REU',checkedAt:new Date().toISOString(),message:'',opportunities:[opportunity('Late result')]}}});resolve();};});
  });
  await page.getByRole('tab',{name:'Research',exact:true}).click();await page.getByLabel('REU research topics').fill('biology');
  await page.getByRole('button',{name:'Find REUs',exact:true}).click();await started;
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await finish();
  expect(await page.getByRole('link',{name:'Late result',exact:true}).count()).toBe(0);
  expect(await page.getByLabel('REU research topics').inputValue()).toBe('biology');
 }finally{await browser.close();}
},20000);
