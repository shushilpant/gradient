import { it, expect } from 'vitest';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
const opportunity=(title:string,skills:string[]=[])=>({title,url:`https://university.edu/${title.replace(/ /g,'-')}`,matchedTopics:['machine learning'],skills,summary:'Machine learning REU with undergraduate research.',deadlineEvidence:null,eligibilityEvidence:'Undergraduate students',fundingEvidence:null,status:'Check current application cycle'});
it('finds REUs using topic keywords and displays evidence without sending course data',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);let body:unknown;
  await page.route('http://127.0.0.1:8765/api/v1/assistant/reu/search',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   body=route.request().postDataJSON();
   return route.fulfill({headers,json:{query:'REU biology',checkedAt:new Date().toISOString(),message:'',opportunities:[{...opportunity('Biology research summer'),matchedTopics:['biology'],applicationUrl:'https://university.edu/apply'}]}});
  });
  await page.getByRole('tab',{name:'Research',exact:true}).click();
  await page.getByLabel('REU research topics').fill('biology');
  await page.getByRole('button',{name:'Find REUs',exact:true}).click();
  await page.getByRole('link',{name:'Biology research summer',exact:true}).waitFor();expect(body).toEqual({topics:['biology']});
  expect(await page.getByRole('link',{name:'Application information from programme page'}).getAttribute('href')).toBe('https://university.edu/apply');
  await page.getByText('Deadline, eligibility & funding',{exact:true}).click();
  expect(await page.getByRole('region',{name:'REU search results'}).innerText()).toContain('Not found on the source page.');
  expect(await page.getByRole('region',{name:'REU search results'}).innerText()).toContain('Current application status is unverified');
 }finally{await browser.close();}
},20000);
it('ranks programme skills against evidenced course exposure and explains the overlap',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser,{configureData:courses=>{courses[0]!.course.syllabus_body='<p>Learning objectives include machine learning with Python.</p>';}});
 try{
  await waitForLoaded(page);
  await page.route('http://127.0.0.1:8765/api/v1/assistant/reu/search',route=>route.request().method()==='OPTIONS'?route.fulfill({status:204,headers}):route.fulfill({headers,json:{query:'REU',checkedAt:new Date().toISOString(),message:'',opportunities:[opportunity('A general REU'),{...opportunity('Z Python REU',['Python']),skillEvidence:{Python:'Python is used for research.'}}]}}));
  await page.getByRole('tab',{name:'Research',exact:true}).click();
  await page.getByLabel('REU research topics').fill('machine learning');await page.getByRole('button',{name:'Find REUs',exact:true}).click();
  await page.getByRole('link',{name:'Z Python REU',exact:true}).waitFor();
  const first=page.getByRole('region',{name:'REU search results'}).locator('article').first();
  expect(await first.innerText()).toContain('Z Python REU');expect(await first.innerText()).toContain('Overlap score 3');
  await first.getByText('Why this matches your coursework',{exact:true}).click();
  expect(await first.innerText()).toContain('Learning objectives include machine learning with Python.');
  expect(await first.innerText()).toContain('Programme source excerpt: “Python is used for research.”');
 }finally{await browser.close();}
},20000);
it('ignores a cancelled search response and preserves the editable profile',async()=>{
 const browser=await launchBrowser(),{page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);let finish!:()=>Promise<void>;let requested!:()=>void;
  const started=new Promise<void>(resolve=>{requested=resolve;});
  await page.route('http://127.0.0.1:8765/api/v1/assistant/reu/search',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   requested();return new Promise<void>(resolve=>{finish=async()=>{await route.fulfill({headers,json:{query:'REU',checkedAt:new Date().toISOString(),message:'',opportunities:[opportunity('Late result')]}});resolve();};});
  });
  await page.getByRole('tab',{name:'Research',exact:true}).click();await page.getByLabel('REU research topics').fill('biology');
  await page.getByRole('button',{name:'Find REUs',exact:true}).click();await started;
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await finish();
  expect(await page.getByRole('link',{name:'Late result',exact:true}).count()).toBe(0);
  expect(await page.getByLabel('REU research topics').inputValue()).toBe('biology');
 }finally{await browser.close();}
},20000);
