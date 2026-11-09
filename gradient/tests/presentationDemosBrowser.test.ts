import {it,expect} from 'vitest';
import {launchBrowser,mockCanvas,waitForLoaded} from './browserHarness.js';

it('plays the prepared Automation demo without live services',async()=>{
 const browser=await launchBrowser();
 const {page}=await mockCanvas(browser,{denied:true});
 try{
  await page.getByRole('alert').first().waitFor();
  const requests:string[]=[];
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.getByRole('tab',{name:'Automation',exact:true}).click();
  await page.getByRole('button',{name:'Demo Automation',exact:true}).click();
  await page.getByRole('region',{name:'Automation demo run',exact:true}).waitFor();
  expect(await page.getByRole('region',{name:'Saved automation sequence',exact:true}).count()).toBe(0);
  await page.getByRole('region',{name:'Saved automation sequence',exact:true}).waitFor({timeout:15000});
  const plot=page.locator('.ja-rendered-visual img');
  await expect.poll(()=>plot.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>100)).toBe(true);
  expect(await page.getByRole('button',{name:'Run saved Canvas demo',exact:true}).isDisabled()).toBe(true);
  expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Back to my workspace',exact:true}).click();
  expect(await page.getByRole('region',{name:'Prepared automation demo',exact:true}).count()).toBe(0);
  await page.getByRole('alert').first().waitFor();
 }finally{await browser.close();}
},30000);

it('plays a staged demo for every module, then returns to live coursework',async()=>{
 const browser=await launchBrowser();const {page,requests}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);const before=requests.length;
  const results:Record<string,string>={Academics:'Rebuilt grades','AI Workspace':'Prepared study guide',Research:'Example programme matches'};
  for(const [module,region] of Object.entries(results)){
   await page.getByRole('tab',{name:module,exact:true}).click();
   await page.getByRole('button',{name:`Demo ${module}`,exact:true}).click();
   await page.getByRole('region',{name:`${module==='AI Workspace'?'Homework Autopilot':module} demo run`,exact:true}).waitFor();
   expect(await page.getByRole('region',{name:region,exact:true}).count()).toBe(0);
   await page.getByRole('region',{name:region,exact:true}).waitFor({timeout:15000});
  }
  await page.getByRole('tab',{name:'Academics',exact:true}).click();
  expect(await page.getByRole('region',{name:'Rebuilt grades',exact:true}).count()).toBe(0);
  await waitForLoaded(page);
  expect(requests.length).toBe(before);
 }finally{await browser.close();}
},60000);
