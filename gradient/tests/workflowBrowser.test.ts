import {it} from 'vitest';
import {launchBrowser,mockCanvas} from './browserHarness.js';
it('offers manual mode and directs main-page Auto to the local Canvas tab',async()=>{
 const browser=await launchBrowser();const {page}=await mockCanvas(browser,{workflowMode:null});
 try{
  await page.route('http://127.0.0.1:8765/api/v1/computer/config',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},json:{sandboxOrigin:'http://127.0.0.1:8080',engine:'agent',isolation:'local',available:true,browserAvailable:true,message:'Ready'}}));
  await page.getByRole('button',{name:'Use auto mode',exact:true}).click();
  await page.getByRole('button',{name:'Start automatic workflow',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Open local Canvas'}).waitFor();
  await page.getByRole('button',{name:'Use manual mode',exact:true}).click();
  await page.getByRole('tab',{name:'Overview',exact:true}).waitFor({state:'visible'});
 }finally{await browser.close();}
});
