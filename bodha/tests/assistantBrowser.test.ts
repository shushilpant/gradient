import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

const packet = {
  title: 'A sourced systems study packet', summary: 'A complete reference for your assignment.',
  markdown: JSON.stringify({title:'Time-Shift Property',nodes:[{id:'f',label:'f(t-a)u(t-a)'},{id:'F',label:'F(s)'},{id:'shift',label:'e^{-as}F(s)'}],edges:[{from:'f',to:'F',label:'Laplace'},{from:'F',to:'shift',label:'multiply by e^{-as}'}]}, null, 2) + '\n\n```json\n' + JSON.stringify({title:'Fenced diagram',nodes:[{id:'a',label:'Input'},{id:'b',label:'Output'}],edges:[{from:'a',to:'b'}]}) + '\n```\n\n' + '## How it works\n\nUnderstand the process [S1]. Inline \\(x^2 + \\frac{1}{2}\\).\n\n$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n\n<script>window.injected=true</script>\n\n[Unsafe](javascript:alert(1))',
  sampleMarkdown: '## Sample assignment for review\n\nA worked reference answer, with a disclosed AI contribution.',
  sources: [{ id: 'S1', title: 'Verified course guide', url: 'https://canvas.instructure.com/courses/99001/pages/signals-study-guide', kind: 'canvas' }],
  diagrams: [{ title: 'Branching process', nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Left' }, { id: 'c', label: 'Right' }], edges: [{ from: 'a', to: 'b', label: 'Path one' }, { from: 'a', to: 'c', label: 'Path two' }] }],
  graphs: [{ title: 'Illustrative comparison', xLabel: 'Condition', yLabel: 'Value', points: [{ label: 'A', value: 10 }, { label: 'B', value: -4 }] }],
  images: [], warnings: ['Verify the sample against the rubric.'],
  renderedVisuals: [{id:'plot-1',title:'Computed time-shift response',kind:'function',mimeType:'image/png',data:readFileSync(new URL('./fixtures/computed-time-shift.png',import.meta.url)).toString('base64'),caption:'Computed from the assignment equation; zero before t=2.',provenance:{sourceId:'S1',quote:'f(t) = (t-2)*exp(-(t-2))*u(t-2)'},verification:'computed'}],
};

async function mockAssistant(page: Page, received: Record<string, any>[], failure = false, resultPacket: Record<string, any> = packet) {
  await page.route('http://127.0.0.1:8765/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/health')) return route.fulfill({ headers, json: {
      ok: true, ollamaConnected: true, models: ['gpt-oss:20b', 'gemma4:31b', 'gemma4:e4b', 'remote-model:latest', 'llamacpp:raw-digest'],
      modelDetails: [
        { name: 'gpt-oss:20b', size: 13000000000, capabilities: ['completion', 'thinking'], parameterSize: '20.9B', quantization: 'MXFP4' },
        { name: 'gemma4:31b', size: 19000000000, capabilities: ['completion', 'vision', 'thinking'] },
        { name: 'gemma4:e4b', size: 6300000000, capabilities: ['completion', 'vision', 'thinking'] },
        { name: 'remote-model:latest', size: 500, capabilities: ['completion', 'vision'], remote: true },
        { name: 'llamacpp:raw-digest', size: 6300000000, capabilities: ['completion', 'vision'] },
      ], recommended: { reasoningModel: 'gpt-oss:20b', visionModel: 'gemma4:e4b', reason: 'Efficient local reasoning and a compact vision model.' }, pullStates: {},
    } });
    if (path.endsWith('/jobs') && request.method() === 'POST') {
      received.push(request.postDataJSON());
      return route.fulfill({ headers, json: { id: 'test-job', status: 'running' } });
    }
    if (path.endsWith('/jobs/test-job')) return route.fulfill({ headers, json: failure ? { status: 'error', error: 'Not enough memory for this model.' } : { status: 'complete', stage: 'complete', label: 'Ready for review', result: resultPacket } });
    return route.fulfill({ headers, status: 404, json: { detail: 'Unsupported test endpoint' } });
  });
}

async function connect(page: Page) {
  page.setDefaultTimeout(5000);
  await page.getByRole('tab', { name: 'AI Workspace', exact: true }).click();
  await page.getByText('Local AI ready', { exact: true }).waitFor();
}

describe('Local study assistant browser flow', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });


  it('shows external reading links, focus and self-check questions in study packets', async () => {
    const {page} = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await mockAssistant(page, [], false, {...packet,
        readingGuide:[{sourceId:'S2',focus:'Read the time-shift theorem and its worked example.',question:'How does a delay change the Laplace transform?',access:'search snippet only; full page unavailable'}],
        sources:[...packet.sources,{id:'S2',title:'University transform notes',url:'https://university.example/transforms',kind:'web'}]});
      await connect(page);
      await page.getByRole('button',{name:'Build my study packet',exact:true}).click();
      const guide = page.getByRole('region',{name:'Reading guide',exact:true});
      await guide.getByRole('link',{name:'University transform notes'}).waitFor();
      expect(await guide.getByRole('link').getAttribute('href')).toBe('https://university.example/transforms');
      expect(await guide.innerText()).toContain('How does a delay change the Laplace transform?');
      expect(await guide.innerText()).toContain('Search snippet only');
    } finally {await page.close();}
  });

  it('cancels a pending packet and lets a new request finish without accepting the old result', async () => {
    const { page } = await mockCanvas(browser);
    let completed = false;
    let jobCount = 0;
    try {
      await waitForLoaded(page);
      await mockAssistant(page, []);
      await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs**', route => {
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (route.request().method() === 'POST') return route.fulfill({ headers, json: { id: `cancel-${++jobCount}` } });
        return route.fulfill({ headers, json: completed ? { status: 'complete', result: packet } : { status: 'running', stage: 'drafting', label: 'Writing the packet' } });
      });
      await connect(page);
      await page.getByRole('button', { name: 'Build my study packet', exact: true }).click();
      await page.getByText('Writing the packet', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await page.getByRole('button', { name: 'Build my study packet', exact: true }).isEnabled()).toBe(true);
      expect(await page.getByRole('region', { name: 'Generated study packet' }).count()).toBe(0);
      completed = true;
      await page.getByRole('button', { name: 'Build my study packet', exact: true }).click();
      await page.getByRole('heading', { name: packet.title, exact: true }).waitFor();
      expect(jobCount).toBe(2);
    } finally { await page.close(); }
  }, 20000);


  it('clears assignment-specific output when the student selects another course', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await mockAssistant(page, []);
      await connect(page);
      await page.getByRole('button', { name: 'Build my study packet', exact: true }).click();
      await page.getByRole('heading', { name: packet.title, exact: true }).waitFor();
      const coursePicker = page.getByLabel('Assistant course', { exact: true });
      const ids = await coursePicker.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
      await coursePicker.selectOption(ids[1]!);
      await page.getByRole('region', { name: 'Generated study packet' }).waitFor({ state: 'detached' });
      await page.getByLabel('Assistant assignment', {exact:true}).selectOption('__course__');
      expect(await page.getByRole('button', { name: 'Build my study packet', exact: true }).isEnabled()).toBe(true);
    } finally { await page.close(); }
  }, 15000);

  it('renders display equations directly after prose without requiring a blank line',async()=>{
    const {page}=await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await mockAssistant(page,[],false,{...packet,markdown:'Differentiate the signal:\n\\[\n\\n g\'(t)=e^{-(t-2)}\\bigl[1-(t-2)\\bigr]\n\\]\nThe maximum is:\n$$\nf(3)=e^{-1}\n$$\nThe code stays literal.\n```text\n\\[not rendered as math\\]\n```',sampleMarkdown:''});
      await connect(page);
      await page.getByRole('button',{name:'Build my study packet',exact:true}).click();
      await page.getByRole('heading',{name:packet.title,exact:true}).waitFor();
      expect(await page.locator('.ja-result .ja-math-block math').count()).toBe(2);
      expect(await page.locator('.ja-result .ja-math-error').count()).toBe(0);
      expect(await page.locator('.ja-result pre').innerText()).toBe('\\[not rendered as math\\]');
      expect((await page.locator('.ja-result p').allTextContents()).join('\n')).not.toContain('\\[');
    } finally {await page.close();}
  });

  it('builds a sample at the chosen depth, reads course pages, safely renders visuals, exports and retains it across tabs', async () => {
    const { page } = await mockCanvas(browser);
    const received: Record<string, any>[] = [];
    try {
      await waitForLoaded(page);
      await mockAssistant(page, received);
      await page.evaluate(() => localStorage.setItem('gradient_assistant_settings', JSON.stringify({ backendUrl: 'http://127.0.0.1:8765', reasoningModel: 'qwen3:8b', visionModel: 'qwen3-vl:8b', detailLevel: 'a_bit_more', webResearch: true })));
      await page.route('**/api/v1/courses/99001/pages/signals-study-guide', route => route.fulfill({ json: { body: '<p>A real retrieved explanation of signals.</p>', published: true } }));
      await connect(page);
      expect(await page.locator('#ja-reasoning-model').inputValue()).toBe('gpt-oss:20b');
      expect(await page.locator('#ja-vision-model').inputValue()).toBe('gemma4:e4b');
      const choices = await page.locator('#ja-reasoning-model option').allTextContents();
      expect(choices.join(' ')).not.toMatch(/remote-model|llamacpp/);
      await page.getByRole('button', { name: 'Go all in', exact: false }).click();
      await page.getByRole('button', { name: 'Reference example', exact: true }).click();
      await page.getByLabel('Anything you want me to focus on?').fill('Explain each step and include the diagram.');
      await page.getByRole('button', { name: 'Create reference example' }).click();
      await page.getByRole('heading', { name: packet.title, exact: true }).waitFor({ timeout: 10000 });
      expect(received[0]?.type).toBe('generate');
      expect(received[0]?.request).toMatchObject({ level: 'all_in', mode: 'sample', model: 'gpt-oss:20b' });
      expect(received[0]?.request.resources.some((r: any) => r.text?.includes('real retrieved explanation'))).toBe(true);
      expect(await page.locator('.ja-result math').count()).toBe(2);
      expect(await page.getByRole('img', {name: 'Time-Shift Property:', exact:false}).count()).toBe(0);
      expect(await page.getByRole('img', {name: 'Fenced diagram:', exact:false}).count()).toBe(0);
      expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
      expect(await page.locator('.ja-result a[href^="javascript:"]').count()).toBe(0);
      expect(await page.getByRole('img', { name: 'Illustrative comparison' }).count()).toBe(0);
      expect(await page.getByRole('img', { name: 'Computed from the assignment equation; zero before t=2.' }).count()).toBe(1);
      expect(await page.locator('.ja-result').innerText()).not.toContain('Start → Right');
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export illustrated HTML' }).click();
      const download = await downloading;
      const file = await download.path();
      expect(download.suggestedFilename()).toMatch(/\.html$/);
      const html = readFileSync(file!, 'utf8');
      expect(html).toContain('data:image/png;base64,');
      expect(html).toContain('Verified course guide');
      expect(html).toContain('AI-generated reference material for learning.');
      expect(html).not.toContain('<script>window.injected=true</script>');
      await page.getByRole('tab', { name: 'Academics', exact: true }).click();
      await page.getByRole('tab', { name: 'AI Workspace', exact: true }).click();
      expect(await page.getByRole('heading', { name: packet.title, exact: true }).isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await page.getByText('Local AI ready', { exact: true }).waitFor();
      expect(await page.getByRole('heading', { name: packet.title, exact: true }).count()).toBe(0);
      expect(received).toHaveLength(1);
      await page.screenshot({ path: '/private/tmp/offcanvas-assistant.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      const workspace = await page.locator('#offcanvas-workspace').boundingBox();
      expect(workspace!.width).toBeLessThanOrEqual(390);
      expect(await page.locator('.ja').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    } finally { await page.close(); }
  }, 20000);

  it('shows model errors and allows a retry without fabricating a packet', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await mockAssistant(page, [], true);
      await connect(page);
      await page.getByRole('button', { name: 'Build my study packet', exact: true }).click();
      await page.getByText('Not enough memory for this model.', { exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Build my study packet', exact: true }).isEnabled()).toBe(true);
      expect(await page.getByRole('region', { name: 'Generated study packet' }).count()).toBe(0);
    } finally { await page.close(); }
  }, 20000);
  it('renders only the final assignment for autopilot and blocks assessments', async () => {
    const brief = 'Plot f(t) = (t-2)*exp(-(t-2))*u(t-2) and explain the time shift.';
    const { page } = await mockCanvas(browser, {configureData: courses => {
      const course = courses[0]!;
      for (const assignment of course.assignments) assignment.description = `<p>${brief}</p>`;
      course.assignments[0].name = 'Homework: time-shift response';
      course.assignments[1].name = 'Exam 2';
      course.assignments[1].submission_types = ['online_quiz'];
    }});
    const received:Record<string,any>[]=[];
    try {
      await waitForLoaded(page);
      await mockAssistant(page, received, false, {...packet,autopilot:true,sampleMarkdown:'Final answer: $x=2$.',finalLatex:'\\documentclass{article}\n\\begin{document}\nFinal answer: $x=2$.\n\\end{document}',brief:{summary:'Plot and explain the response.',requirements:[{id:'R1',text:'Plot the time-shifted response',evidence:brief}],missingInformation:[]},review:{coverage:[{requirementId:'R1',status:'covered',evidence:'A worked reference answer',notes:'Check the equation against the course convention.'}],limitations:['Model review still needs a human calculation check.']}});
      await connect(page);
      const assignmentSelect=page.getByLabel('Assistant assignment', {exact:true});
      await assignmentSelect.selectOption({label:'Homework: time-shift response'});
      await page.getByRole('switch',{name:'Homework autopilot',exact:true}).click();
      expect(await page.getByRole('button',{name:'Run homework autopilot'}).isDisabled()).toBe(true);
      await page.getByLabel('This is homework, not an exam, quiz, or timed assessment.').check();
      await page.getByRole('button',{name:'Run homework autopilot'}).click();
      const final = page.getByRole('region',{name:'Final assignment',exact:true});
      await final.waitFor();
      expect(received[0]?.request).toMatchObject({autopilot:true,assignmentKind:'homework',mode:'sample',level:'all_in'});
      expect(await final.innerText()).toContain('Final answer:');
      expect(await final.locator('math').count()).toBe(1);
      expect(await final.locator('pre').count()).toBe(0);
      expect(await final.innerText()).not.toContain('\\documentclass');
      expect(await page.getByRole('region',{name:'Assignment requirements and review'}).count()).toBe(0);
      expect(await final.innerText()).not.toContain(packet.summary);
      expect(await final.innerText()).not.toContain(packet.markdown);
      expect(await page.getByRole('button',{name:'Export illustrated HTML',exact:true}).count()).toBe(0);
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button',{name:'Download LaTeX',exact:true}).click();
      expect((await downloaded).suggestedFilename()).toMatch(/\.tex$/);
      await page.locator('.g-body').evaluate(el=>el.scrollTo(0,0));
      await page.screenshot({path:'/private/tmp/offcanvas-autopilot-workbench.png',fullPage:true});
      await assignmentSelect.selectOption({label:'Exam 2'});
      expect(await page.getByRole('button',{name:'Run homework autopilot'}).isDisabled()).toBe(true);
      expect(await page.getByRole('alert').filter({hasText:'homework only'}).count()).toBe(1);
      expect(received).toHaveLength(1);
      await page.getByRole('switch', {name:'Homework autopilot',exact:true}).click();
      await page.getByRole('button', {name:'Reference example',exact:true}).click();
      expect(await page.getByRole('button', {name:'Create reference example',exact:true}).isDisabled()).toBe(true);
      await assignmentSelect.selectOption('__course__');
      expect(await page.getByRole('button', {name:'Build my study packet',exact:true}).isEnabled()).toBe(true);
      for (const width of [375,768,1024,1440]) {
        await page.setViewportSize({width,height:900});
        expect(await page.locator('#offcanvas-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      }
    } finally {await page.close();}
  }, 20000);

  it('derives a public topic locally before browser research for a generic homework title', async () => {
    const {page}=await mockCanvas(browser,{configureData:courses=>{for(const a of courses[0]!.assignments){a.name='Homework 9';a.description='<p>Private course instructions: explain the Laplace time-shift property.</p>';}}});
    const received:Record<string,any>[]=[];
    try {
      await waitForLoaded(page);
      await mockAssistant(page, received);
      await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs**',route=>{
        const request=route.request();const path=new URL(request.url()).pathname;
        const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
        if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
        if(request.method()==='POST') {const body=request.postDataJSON();received.push(body);return route.fulfill({headers,json:{id:body.type==='research'?'research-job':'generate-job'}});}
        return route.fulfill({headers,json:{status:'complete',result:path.endsWith('research-job')?{query:'laplace transform time shift tutorial',warning:null}:packet}});
      });
      await page.evaluate(()=>{
        const w=window as any;w.__queries=[];
        const c=w.chrome||{};
        c.runtime={id:'test-extension',sendMessage:async(message:any)=>{
          if(message.type==='OFFCANVAS_ENABLE_SEARCH') return {ok:true,data:{granted:true}};
          if(message.type==='OFFCANVAS_BROWSER_SEARCH'){w.__queries.push(message.query);return {ok:true,data:[{title:'Laplace guide',url:'https://university.example/laplace',snippet:'A public reference'}]};}
          if(message.type==='OFFCANVAS_ASSISTANT_REQUEST'){
            const response=await fetch(message.backendUrl+message.path,{method:message.method,headers:{'Content-Type':'application/json'},body:message.method==='POST'?JSON.stringify(message.body):undefined});
            return {ok:response.ok,data:await response.json()};
          }
          return {ok:false,error:'Not used in this test'};
        }};
        if(!w.chrome)Object.defineProperty(window,'chrome',{value:c,configurable:true});
      });
      await connect(page);
      await page.getByRole('button',{name:'Build my study packet',exact:true}).click();
      await page.getByRole('heading',{name:packet.title,exact:true}).waitFor();
      expect(received.map(job=>job.type)).toEqual(['research','generate']);
      expect(await page.evaluate(()=>(window as any).__queries)).toEqual(['laplace transform time shift tutorial']);
      expect(received[1]?.request.webSources[0].title).toBe('Laplace guide');
    } finally {await page.close();}
  },20000);

  it('explains course concepts from the shared syllabus without requiring an assignment', async () => {
    const { page } = await mockCanvas(browser, { configureData: courses => { courses[0]!.course.syllabus_body = '<p>Learning objectives: analyse algorithms and compare complexity.</p>'; } });
    const received: Record<string, any>[] = [];
    try {
      await waitForLoaded(page); await mockAssistant(page, received); await connect(page);
      await page.getByLabel('Assistant assignment', { exact:true }).selectOption('__course__');
      expect(await page.getByRole('switch', { name:'Homework autopilot', exact:true }).isDisabled()).toBe(true);
      await page.getByRole('button', { name:'Build my study packet', exact:true }).click();
      await page.getByRole('heading', { name:packet.title, exact:true }).waitFor();
      expect(received[0]?.request.assignment.title).toBe('LIVE-101 course concepts');
      expect(received[0]?.request.assignment.description).toContain('analyse algorithms');
      expect(received[0]?.request.autopilot).toBe(false);
    } finally { await page.close(); }
  });

  it('uses the course syllabus by default when no assignments are available', async () => {
    const { page } = await mockCanvas(browser, { configureData: courses => { courses[0]!.assignments = []; courses[0]!.course.syllabus_body = '<p>Course objective: analyse recursive algorithms.</p>'; } });
    const received: Record<string, any>[] = [];
    try {
      await waitForLoaded(page); await mockAssistant(page, received); await connect(page);
      await page.getByRole('button', { name:'Build my study packet', exact:true }).click();
      await page.getByRole('heading', { name:packet.title, exact:true }).waitFor();
      expect(received[0]?.request.assignment.description).toContain('recursive algorithms');
    } finally { await page.close(); }
  });

  it('discards a browser inspection when its course changes before the response arrives', async () => {
    const { page } = await mockCanvas(browser);
    let started!: () => void, release!: () => void;
    const pending = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    try {
      await waitForLoaded(page); await mockAssistant(page, []);
      await page.route('http://127.0.0.1:8765/api/v1/assistant/jobs**', async route => {
        const headers = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status:204, headers });
        if (route.request().method() === 'POST') return route.fulfill({ headers, json:{id:'inspect-test'} });
        started(); await gate;
        return route.fulfill({ headers, json:{status:'complete',result:{summary:'STALE inspection for previous course',actions:[],warnings:[]}} });
      });
      await connect(page);
      await page.locator('.ja-more > summary').click();
      await page.getByRole('button', { name:'Inspect this Canvas page', exact:true }).click();
      await pending;
      const courses = page.getByLabel('Assistant course', { exact:true });
      const ids = await courses.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
      await courses.selectOption(ids[1]!); release();
      await page.waitForResponse(response => response.url().endsWith('inspect-test'));
      expect(await page.getByText('STALE inspection for previous course').count()).toBe(0);
      expect(await page.getByRole('button', { name:'Inspect this Canvas page', exact:true }).isEnabled()).toBe(true);
    } finally { release?.(); await page.close(); }
  });

});
