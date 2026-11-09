import { describe,it,beforeAll,afterAll,expect } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser,mockCanvas } from './browserHarness.js';
describe('Study studio learning loop',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await launchBrowser();}); afterAll(async()=>{await browser?.close();});

 it('keeps short reading passages and clears course-specific reading and selections when changing courses', async () => {
  const {page} = await mockCanvas(browser, { legacy: true });
  page.setDefaultTimeout(6000);
  await page.route('**/api/v1/courses/*/pages/signals-study-guide', route => route.fulfill({json:{body:'<p>A base case stops recursion.</p>'}}));
  try {
   await page.getByRole('button',{name:/^Study studio/}).click();
   await page.locator('.ss-library label').filter({hasText:'Signals study guide'}).first().locator('input').check();
   await page.getByRole('button',{name:'Import selected material',exact:true}).click();
   await page.getByText(/Readable Canvas text/).waitFor();
   await page.getByRole('button',{name:'Read',exact:true}).click();
   expect(await page.locator('.ss-passage').innerText()).toBe('A base case stops recursion.');
   const coursePicker = page.getByLabel('Studio course', {exact:true});
   const courseIds = await coursePicker.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
   await coursePicker.selectOption(courseIds[1]!);
   await page.getByText('Select material above, then choose “Open selected material”.', {exact:true}).waitFor();
   expect(await page.locator('.ss-passage').count()).toBe(0);
   expect(await page.getByRole('button',{name:'Open selected material',exact:true}).isDisabled()).toBe(true);
   await coursePicker.selectOption(courseIds[0]!);
   await page.locator('.ss-passage').waitFor();
   expect(await page.locator('.ss-passage').innerText()).toBe('A base case stops recursion.');
  } finally { await page.close(); }
 },20000);

 it('imports real source text, builds evidence-backed aids, records practice, and exposes reading and audio',async()=>{
  const {page}=await mockCanvas(browser, { legacy: true }); page.setDefaultTimeout(6000);
  const passage='Recursion solves problems by reducing them to smaller instances. A base case stops the recursion.';
  let request:any;
  let studioVersion = 0;
  await page.route('**/api/v1/courses/*/pages/signals-study-guide',route=>route.fulfill({json:{body:`<p>${passage}</p>`}}));
  await page.route('**/api/v1/assistant/**',route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/health'))return route.fulfill({headers,json:{ok:true,studioVersion,ollamaConnected:true,models:['gpt-oss:20b']}});
   if(path.endsWith('/jobs')){request=route.request().postDataJSON().request;return route.fulfill({headers,json:{id:'studio-test'}});}
   const sourceId=request.resources[0].title.split(': ')[0];
   const deck={title:'Recursion study set',cards:Array.from({length:3},(_,i)=>({id:`c${i}`,question:`How does recursion work (${i+1})?`,answer:'Smaller instances',options:['Smaller instances','Larger problems','Random guesses','No base case'],explanation:'The problem is reduced until a base case.',topic:'Recursion',sourceId,quote:passage})),concepts:[{id:'n1',label:'Recursion',explanation:'Break the problem into smaller instances.',parentId:null,sourceId,quote:passage}]};
   return route.fulfill({headers,json:{status:'complete',result:{title:'Study set',summary:'Ready',markdown:JSON.stringify(deck),sampleMarkdown:'',sources:[],diagrams:[],graphs:[],images:[],warnings:[]}}});
  });
  try{
   await page.getByRole('button',{name:/^Study studio/}).click();
   await page.locator('.ss-library label').filter({hasText:'Signals study guide'}).first().locator('input').check();
   await page.getByRole('button',{name:'Import selected material',exact:true}).click();
   await page.getByText(/Readable Canvas text/).waitFor();
   await page.getByRole('button',{name:'Build study set',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'older version without Study Studio support'}).waitFor();
   expect(request).toBeUndefined();
   studioVersion = 1;
   await page.getByRole('button',{name:'Build study set',exact:true}).click();
   await page.getByRole('button',{name:'Reveal answer',exact:true}).waitFor();
   await page.getByRole('button',{name:'Show supporting passage',exact:true}).click();
   expect(await page.getByRole('complementary',{name:'Supporting evidence'}).innerText()).toContain(passage);
   await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
   await page.getByRole('button',{name:'Missed it',exact:true}).click();
   await page.getByRole('button',{name:'Practice',exact:true}).click();
   await page.getByRole('button',{name:'Larger problems',exact:true}).click();
   expect(await page.locator('.ss-study-card').innerText()).toContain('Correct answer: Smaller instances');
   const download = page.waitForEvent('download');
   await page.getByRole('button',{name:'Schedule 15-minute review',exact:true}).click();
   expect((await download).suggestedFilename()).toBe('offcanvas-review.ics');
   await page.getByRole('button',{name:'Concept map',exact:true}).click();
   await page.locator('.ss-node').click();
   expect(await page.getByText('Break the problem into smaller instances.',{exact:true}).isVisible()).toBe(true);
   await page.getByRole('button',{name:'Listen',exact:true}).click();
   await page.getByRole('button',{name:'Pause & explore this concept',exact:true}).click();
   await page.getByRole('button',{name:'Guided reading',exact:true}).click();
   expect(await page.locator('.ss-passage').innerText()).toContain('Recursion solves problems');
   await page.screenshot({path:'/tmp/offcanvas-study-studio.png'});
  }finally{await page.close();}
 },25000);
});
