import {it,expect} from 'vitest';
import type { Page } from 'playwright';
import {launchBrowser,mockCanvas,waitForLoaded} from './browserHarness.js';

it('directs Automation demos to the actual local Canvas replica',async()=>{
 const browser=await launchBrowser();
 const {page}=await mockCanvas(browser,{denied:true});
 try{
  await page.getByRole('alert').first().waitFor();
  const requests:string[]=[];
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.getByRole('tab',{name:'Automation',exact:true}).click();
  await page.getByRole('button',{name:'Present',exact:true}).click();
  await page.getByRole('button',{name:'Demo Automation',exact:true}).click();
  await page.getByRole('region',{name:'Automation demo run',exact:true}).waitFor();
  expect(await page.getByRole('region',{name:'Saved automation sequence',exact:true}).count()).toBe(0);
  const setup=page.getByRole('region',{name:'Local Canvas demo setup',exact:true});
  await setup.waitFor();
  expect(await setup.getByRole('link',{name:'Open local Canvas',exact:true}).getAttribute('href')).toBe('http://127.0.0.1:8080/');
  expect(await page.locator('#offcanvas-automation-cursor').count()).toBe(0);
  expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Back to my workspace',exact:true}).click();
  expect(await page.getByRole('region',{name:'Prepared automation demo',exact:true}).count()).toBe(0);
  await page.getByRole('alert').first().waitFor();
 }finally{await browser.close();}
},30000);

it('shows main Canvas setup guidance when Panic automation cannot start', async () => {
  const browser = await launchBrowser();
  try {
    for (const origin of ['https://canvas.instructure.com', 'http://127.0.0.1:8080']) {
      const { page } = await mockCanvas(browser, { origin });
      try {
        await waitForLoaded(page);
        const startingUrl = page.url();
        await page.getByRole('button', { name: 'Present', exact: true }).click();
        await page.getByRole('button', { name: 'Demo Academics', exact: true }).click();
        const setup = page.getByRole('region', { name: 'Panic automation demo', exact: true });
        await setup.getByRole('button', { name: 'Demo panic automation', exact: true }).click();
        const error = setup.getByRole('alert');
        await error.waitFor();
        expect(await error.innerText()).toContain(origin.startsWith('https:')
          ? 'Open the signed-in local Canvas replica' : 'Import CE 240 Homework 1');
        expect(await setup.getByRole('link', { name: 'Open local Canvas' }).count()).toBe(origin.startsWith('https:') ? 1 : 0);
        expect(await page.getByRole('region', { name: 'Saved Canvas replay', exact: true }).count()).toBe(0);
        expect(await page.getByRole('region', { name: 'Saved panic reference', exact: true }).count()).toBe(0);
        expect(await page.locator('#offcanvas-automation-cursor').count()).toBe(0);
        expect(page.url()).toBe(startingUrl);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 20000);

const STUDY_ASSIGNMENT='Homework 2 - Trapezoidal Piecewise-Linear Waveforms';
const STUDY_TITLE=`CE 240 · ${STUDY_ASSIGNMENT} study packet`;
const WAVEFORM_CAPTION='Illustrative trapezoidal waveform: rises from (0, 0) to (1, 2), stays at 2 through t = 3, and falls to (4, 0).';

async function expectStudySetup(page:Page){
 const setup=page.getByRole('region',{name:'Study packet demo setup',exact:true});
 await setup.waitFor({timeout:18000});
 for(const [label,selected] of [['Assistant course','CE 240 · Signals and Systems'],['Assistant assignment',STUDY_ASSIGNMENT]] as const){
  const select=setup.getByLabel(label,{exact:true});
  expect(await select.isDisabled()).toBe(true);
  expect(await select.locator('option:checked').textContent()).toBe(selected);
 }
 const levels=setup.getByRole('group',{name:'Response detail level',exact:true});
 for(const name of ['A bit','A bit more','Go all in']){
  const level=levels.getByRole('button',{name,exact:true});
  expect(await level.isDisabled()).toBe(true);
  expect(await level.getAttribute('aria-pressed')).toBe(String(name==='Go all in'));
 }
 const modes=setup.getByRole('group',{name:'Assistant output type',exact:true});
 for(const name of ['Study','Reference example']){
  const mode=modes.getByRole('button',{name,exact:true});
  expect(await mode.isDisabled()).toBe(true);
  expect(await mode.getAttribute('aria-pressed')).toBe(String(name==='Study'));
 }
 const build=setup.getByRole('button',{name:'Build my study packet',exact:true});
 expect(await build.isEnabled()).toBe(true);
 return build;
}

async function expectTrapezoidalPacket(page:Page){
 const result=page.getByRole('region',{name:'Prepared study guide',exact:true});
 await result.waitFor({timeout:15000});
 expect(await result.getByRole('heading',{name:STUDY_TITLE,exact:true}).isVisible()).toBe(true);
 const plot=result.getByRole('img',{name:WAVEFORM_CAPTION,exact:true});
 await expect.poll(()=>plot.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>100)).toBe(true);
 expect(await result.getByText('Trapezoidal piecewise-linear waveform',{exact:true}).isVisible()).toBe(true);
 await result.getByText('Figure provenance',{exact:true}).click();
 expect(await result.getByText(`Source [S1] · CE 240 · ${STUDY_ASSIGNMENT}`,{exact:true}).isVisible()).toBe(true);
 expect(await result.innerText()).not.toContain('1/e');
 return result;
}

it('presents CE 240 Homework 2 trapezoidal waveforms in Study mode at Go all in depth without live services',async()=>{
 const browser=await launchBrowser();
 const {page}=await mockCanvas(browser,{denied:true});
 try{
  await page.getByRole('alert').first().waitFor();
  const requests:string[]=[];
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.getByRole('tab',{name:'AI Workspace',exact:true}).click();
  await page.getByRole('button',{name:'Present',exact:true}).click();
  await page.getByRole('button',{name:'Demo AI Workspace',exact:true}).click();
  const build=await expectStudySetup(page);
  const run=page.getByRole('region',{name:'Study packet demo run',exact:true});
  expect(await run.getAttribute('aria-busy')).toBe('true');
  const result=await expectTrapezoidalPacket(page);
  await build.click();
  expect(await run.getAttribute('aria-busy')).toBe('true');
  expect(await result.count()).toBe(0);
  await result.waitFor({timeout:15000});
  expect(requests).toEqual([]);
 }finally{await browser.close();}
},40000);

it('presents the same CE 240 Homework 2 study packet during Play full tour and continues to Automation',async()=>{
 const browser=await launchBrowser();
 const {page,requests}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);const before=requests.length;
  await page.getByRole('button',{name:'Present',exact:true}).click();
  await page.getByRole('button',{name:'Play full tour',exact:true}).click();
  await page.getByRole('region',{name:'Academics demo run',exact:true}).waitFor();
  await expectStudySetup(page);
  expect(await page.getByRole('tab',{name:'AI Workspace',exact:true}).getAttribute('aria-selected')).toBe('true');
  expect(await page.getByRole('status').filter({hasText:'Tour · 2 of 4'}).count()).toBe(1);
  const result=await expectTrapezoidalPacket(page);
  const run=page.getByRole('region',{name:'Study packet demo run',exact:true});
  await run.getByRole('button',{name:'Run again',exact:true}).click();
  expect(await run.getAttribute('aria-busy')).toBe('true');
  expect(await result.count()).toBe(0);
  await expect.poll(async()=>{
   const progress=page.getByRole('progressbar',{name:'Study packet progress',exact:true});
   return await progress.count()?Number(await progress.getAttribute('aria-valuenow')):-1;
  },{timeout:15000}).toBeGreaterThan(60);
  expect(await page.getByRole('tab',{name:'AI Workspace',exact:true}).getAttribute('aria-selected')).toBe('true');
  await expectTrapezoidalPacket(page);
  await page.getByRole('region',{name:'Automation demo run',exact:true}).waitFor({timeout:10000});
  expect(await page.getByRole('status').filter({hasText:'Tour · 3 of 4'}).count()).toBe(1);
  expect(requests.length).toBe(before);
 }finally{await browser.close();}
},60000);

it('plays a staged demo for every module, then returns to live coursework',async()=>{
 const browser=await launchBrowser();const {page,requests}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);const before=requests.length;
  const results:Record<string,string>={Academics:'Rebuilt grades','AI Workspace':'Prepared study guide',Research:'Example programme matches'};
  for(const [module,region] of Object.entries(results)){
   await page.getByRole('tab',{name:module,exact:true}).click();
   await page.getByRole('button',{name:'Present',exact:true}).click();
   await page.getByRole('button',{name:`Demo ${module}`,exact:true}).click();
   await page.getByRole('region',{name:`${module==='AI Workspace'?'Study packet':module} demo run`,exact:true}).waitFor();
   expect(await page.getByRole('region',{name:region,exact:true}).count()).toBe(0);
   await page.getByRole('region',{name:region,exact:true}).waitFor({timeout:15000});
   if(region==='Rebuilt grades'){
    const grades=page.getByRole('region',{name:'Rebuilt grades',exact:true});
    await grades.getByText('1.7 points short of an A').waitFor();
    expect(await grades.innerText()).toContain('Final mark can still land from 94.2% to 60.9%, down to a D-');
    const time = page.getByRole('region', { name: 'Time on Canvas', exact: true });
    await time.waitFor();
    const timeText = await time.innerText();
    expect(timeText).toContain('21.0');
    expect(timeText).not.toContain('Sample week');
    expect(timeText).not.toContain('for this demo');
    expect(timeText).toContain('LIVE-101 took 10.5 of those hours');
    expect(timeText).toContain('BIO-110 got 3.5 hours');
    await time.getByRole('button').nth(6).hover();
    const day = time.getByRole('status');
    await day.waitFor();
    expect(await day.innerText()).toMatch(/Total\s+\d+\.\dh/);
   }
  }
  await page.getByRole('tab',{name:'Academics',exact:true}).click();
  expect(await page.getByRole('region',{name:'Rebuilt grades',exact:true}).count()).toBe(0);
  await waitForLoaded(page);
  expect(requests.length).toBe(before);
 }finally{await browser.close();}
},60000);

it('starts module demos and the full tour from page events, and hands control back on a tab click',async()=>{
 const browser=await launchBrowser();const {page}=await mockCanvas(browser);
 try{
  await waitForLoaded(page);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('offcanvas:demo',{detail:'research'})));
  await page.getByRole('region',{name:'Research demo run',exact:true}).waitFor();
  expect(await page.getByRole('tab',{name:'Research',exact:true}).getAttribute('aria-selected')).toBe('true');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('offcanvas:tour')));
  await page.getByRole('status').filter({hasText:'Tour · 1 of 4'}).waitFor();
  await page.getByRole('region',{name:'Academics demo run',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Research',exact:true}).click();
  expect(await page.getByRole('button',{name:'Stop tour',exact:true}).count()).toBe(0);
  await page.getByRole('button',{name:'Present',exact:true}).click();
  await page.getByRole('button',{name:'Play full tour',exact:true}).waitFor();
 }finally{await browser.close();}
},30000);
