import {it,expect} from 'vitest';
import {launchBrowser,bundle} from './browserHarness.js';
it('navigates the main Canvas tab and preserves control across navigation',async()=>{
 const browser=await launchBrowser();const page=await browser.newPage();
 try{page.setDefaultTimeout(4000);
  await page.route('http://127.0.0.1:8080/**',r=>r.fulfill({contentType:'text/html',body:'<main><h1>Canvas coursework</h1><a href="/courses/1">Signals course</a></main>'}));
  await page.route('http://127.0.0.1:8765/**',r=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
   const url=r.request().url();
   if(url.endsWith('/config'))return r.fulfill({headers,json:{sandboxOrigin:'http://127.0.0.1:8080',engine:'agent',isolation:'local',available:true,browserAvailable:true,message:'Ready'}});
   if(url.endsWith('/jobs'))return r.fulfill({headers,json:{id:'plan'}});
   if(page.url().endsWith('/courses/1'))return r.fulfill({headers,json:{status:'running'}});
   return r.fulfill({headers,json:{status:'complete',result:{summary:'Open course',actions:[{kind:'open',url:'http://127.0.0.1:8080/courses',description:'Unobserved route',text:null},{kind:'open',url:'http://127.0.0.1:8080/courses/999',description:'Unobserved course',text:null},{kind:'open',url:'http://127.0.0.1:8080/courses/1/#content',description:'Opening Signals',text:null}],warnings:[]}}});
  });
  await page.addInitScript(bundle());await page.goto('http://127.0.0.1:8080/');
  await page.getByRole('button',{name:'Use auto mode',exact:true}).click();
  await page.getByRole('button',{name:'Start automatic workflow',exact:true}).click();
  await page.waitForURL('http://127.0.0.1:8080/courses/1');
  expect(browser.contexts()[0]?.pages()).toHaveLength(1);
  await page.getByRole('button',{name:'Stop Auto',exact:true}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem('gradient_page_autopilot'))).toBeNull();
 }finally{await browser.close();}
},20000);
