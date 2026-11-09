import { expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { CANVAS_ORIGIN, launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};
const localCanvas = 'http://127.0.0.1:8080';
const coursePath = '/courses/99001';
const assignmentPath = coursePath + '/assignments/1001';
const assignmentName = 'Homework: Time-shift response';
const assignmentBrief = 'Plot the shifted response on 0 ≤ t ≤ 8 and explain its maximum.';
const nativePages: Record<string, string> = {
  '/': `<h1>Canvas dashboard</h1><a href="${coursePath}" target="_blank">GRADIENT-SIGNALS</a>`,
  [coursePath]: `<h1>Signals and Systems</h1><a href="${coursePath}/assignments">Assignments</a>`,
  [coursePath + '/assignments']: `<h1>Course assignments</h1><a href="${assignmentPath}">${assignmentName}</a>`,
  [assignmentPath]: `<h1>${assignmentName}</h1><p id="assignment-brief">${assignmentBrief}</p>`,
};

async function openAutomation(page: Page) {
  page.setDefaultTimeout(10000);
  await waitForLoaded(page);
  await page.getByRole('tab', { name: 'Automation', exact: true }).click();
}

async function mockLocalWorkflow(browser: Browser, hostileCursorStyles = false) {
  const mocked = await mockCanvas(browser, {
    origin: localCanvas,
    url: localCanvas + '/',
    persistContent: true,
    pageHtml: url => (hostileCursorStyles ? '<style>svg{display:none!important}path{fill:blue!important}body{cursor:default}a{cursor:pointer}</style>' : '') + (nativePages[url.pathname] ?? '<h1>Unknown Canvas page</h1>'),
    configureData(courses) {
      const signals = courses[0]!;
      signals.course.course_code = 'GRADIENT-SIGNALS';
      Object.assign(signals.assignments[0], {
        name: assignmentName,
        description: `<p>${assignmentBrief}</p>`,
      });
    },
  });
  const { page } = mocked;
  const openedPages: Page[] = [];
  const navigation: { path: string; time: number }[] = [];
  page.context().on('page', newPage => openedPages.push(newPage));
  // Page routes handle the original tab. A popup has no fixture or network access.
  await page.context().route('**/*', route => route.abort());
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navigation.push({ path: new URL(frame.url()).pathname, time: performance.now() });
  });
  return { ...mocked, openedPages, navigation };
}

it('replays the saved GRADIENT-SIGNALS assignment in the existing Canvas tab with no model service', async () => {
  const browser = await launchBrowser();
  let releaseSync = () => {};
  const slowSync = new Promise<void>(resolve => { releaseSync = resolve; });
  try {
    const { page, requests, openedPages, navigation } = await mockLocalWorkflow(browser);
    let deferSync = false;
    await page.route(localCanvas + '/api/v1/courses?*', async route => {
      if (deferSync) await slowSync;
      return route.fallback();
    });
    const backendCalls: string[] = [];
    await page.route('http://127.0.0.1:8765/**', route => {
      backendCalls.push(new URL(route.request().url()).pathname);
      return route.abort();
    });
    await openAutomation(page);
    await page.getByText('Live models unavailable', { exact: true }).waitFor();
    const start = page.getByRole('button', { name: 'Start automatic workflow', exact: true });
    const demo = page.getByRole('button', { name: 'Demo automation', exact: true });
    expect(await start.isDisabled()).toBe(true);
    const started = performance.now();
    await demo.click();
    deferSync = true;
    await page.waitForURL(localCanvas + assignmentPath);
    expect(await page.locator('#assignment-brief').innerText()).toBe(assignmentBrief);
    await page.getByRole('status').filter({ hasText: 'Preparing the saved demo assignment' }).waitFor();
    const preparing = performance.now();
    expect(await page.getByRole('region', { name: 'Automatic reference sample', exact: true }).count()).toBe(0);
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor({ timeout: 15000 });
    expect(performance.now() - preparing).toBeGreaterThanOrEqual(9800);
    const result = page.getByRole('region', { name: 'Automatic reference sample', exact: true });
    await result.getByRole('heading', { name: 'Saved reference assignment', exact: true }).waitFor();
    await result.getByRole('heading', { name: assignmentName, exact: true }).waitFor();
    const plot = result.getByRole('img', { name: /response is zero through t = 2/ });
    await expect.poll(() => plot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 800)).toBe(true);
    expect(await result.getByText(localCanvas + assignmentPath, { exact: true }).isVisible()).toBe(true);
    expect(navigation.map(step => step.path)).toEqual([coursePath, coursePath + '/assignments', assignmentPath]);
    for (const [index, step] of navigation.entries()) {
      expect(step.time - (navigation[index - 1]?.time ?? started)).toBeGreaterThanOrEqual(1350);
    }
    expect(backendCalls.every(call => call === '/api/v1/assistant/health')).toBe(true);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(openedPages).toEqual([]);
    expect(page.context().pages()).toEqual([page]);
  } finally {
    releaseSync();
    await browser.close();
  }
}, 35000);

it('keeps the gold automation cursor visible through replay pauses and navigation without replacing the native cursor', async () => {
  const browser = await launchBrowser();
  try {
    const { page, openedPages } = await mockLocalWorkflow(browser, true);
    await page.route('http://127.0.0.1:8765/**', route => route.abort());
    await openAutomation(page);
    const nativeCursors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).cursor,
      link: getComputedStyle(document.querySelector('a')!).cursor,
    }));
    const cursor = page.locator('#gradient-automation-cursor');
    expect(await cursor.count()).toBe(0);
    await page.getByRole('button', { name: 'Demo automation', exact: true }).click();

    const expectVisibleGoldCursor = async () => {
      await cursor.waitFor({ state: 'visible', timeout: 1000 });
      const svg = cursor.locator('svg');
      expect(await svg.isVisible()).toBe(true);
      expect(await svg.locator('path').evaluate(node => getComputedStyle(node).fill)).toBe('rgb(26, 115, 201)');
      const size = await svg.boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(15);
      expect(size?.width).toBeLessThanOrEqual(24);
      expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe(nativeCursors.body);
      const nativeLink = page.locator('#canvas-original a').first();
      if (await nativeLink.count()) expect(await nativeLink.evaluate(node => getComputedStyle(node).cursor)).toBe(nativeCursors.link);
    };
    // It must be present during the first pause, not just immediately before navigation.
    await expectVisibleGoldCursor();
    await page.screenshot({ path: '/private/tmp/gradient-gold-cursor-visible.png' });
    for (const path of [coursePath, coursePath + '/assignments', assignmentPath]) {
      await page.waitForURL(localCanvas + path);
      await expectVisibleGoldCursor();
    }
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor({ timeout: 15000 });
    expect(await cursor.count()).toBe(0);
    expect(openedPages).toEqual([]);

    // A new run removes its marker as soon as the user stops it.
    await page.getByRole('button', { name: 'Demo automation', exact: true }).click();
    await expectVisibleGoldCursor();
    await page.locator('#gradient-page-control').getByRole('button', { name: 'Stop run', exact: true }).click();
    expect(await cursor.count()).toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe(nativeCursors.body);
  } finally {
    await browser.close();
  }
}, 35000);

it('requires approval and generates from the selected homework in the existing read-only Canvas tab', async () => {
  const browser = await launchBrowser();
  try {
    const { page, requests, openedPages, navigation } = await mockLocalWorkflow(browser);
    const jobs: unknown[] = [];
    const packet = {
      title: 'Live time-shift reference',
      summary: 'The response peaks at t = 3.',
      markdown: 'Read the assignment [S1].',
      sampleMarkdown: 'The delayed response is zero before the shift [S1].',
      sources: [{ id: 'S1', title: assignmentName, url: localCanvas + assignmentPath, excerpt: assignmentBrief, kind: 'canvas' }],
      diagrams: [], graphs: [], images: [], warnings: [],
    };
    await page.route('http://127.0.0.1:8765/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/api/v1/assistant/health') {
        return route.fulfill({ headers, json: { ok: true, ollamaConnected: true, models: ['gpt-oss:20b'] } });
      }
      if (path === '/api/v1/assistant/jobs' && request.method() === 'POST') {
        jobs.push(request.postDataJSON());
        return route.fulfill({ headers, status: 202, json: { id: 'live-workflow' } });
      }
      if (path === '/api/v1/assistant/jobs/live-workflow') {
        return route.fulfill({ headers, json: { status: 'complete', result: packet } });
      }
      return route.abort();
    });
    await openAutomation(page);
    await page.getByText('Ready', { exact: true }).waitFor();
    const start = page.getByRole('button', { name: 'Start automatic workflow', exact: true });
    await page.getByLabel('Workflow coursework', { exact: true }).selectOption('99001:1001');
    expect(await page.getByLabel('Automatic workflow goal', { exact: true }).inputValue()).toContain('GRADIENT-SIGNALS');
    await page.getByLabel('Allow optional public web research for supporting concepts').uncheck();
    expect(await start.isDisabled()).toBe(true);
    expect(jobs).toHaveLength(0);
    await page.getByLabel('I approve this read-only workflow in the local sandbox shown above.').check();
    await start.click();
    await page.waitForURL(localCanvas + assignmentPath);
    expect(await page.locator('#assignment-brief').innerText()).toBe(assignmentBrief);
    await page.getByRole('heading', { name: packet.title, exact: true }).waitFor();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: 'generate',
      request: {
        assignment: { id: '1001', title: assignmentName, url: localCanvas + assignmentPath, description: assignmentBrief },
        webResearch: false,
      },
    });
    expect(navigation.at(-1)?.path).toBe(assignmentPath);
    expect(navigation.every(step => Object.hasOwn(nativePages, step.path))).toBe(true);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(openedPages).toEqual([]);
    expect(page.context().pages()).toEqual([page]);
  } finally {
    await browser.close();
  }
}, 20000);

it('requires local-copy approval and cancels page capture before staging a live snapshot', async () => {
  const browser = await launchBrowser();
  const { page } = await mockCanvas(browser);
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const copies: Record<string, unknown>[] = [];
  try {
    await page.route(CANVAS_ORIGIN + '/api/v1/courses/*/pages/*', async route => {
      reads++;
      if (reads === 1) await gate;
      await route.fulfill({ json: { published: true, body: '<p>Course study guide.</p>' } }).catch(() => {});
    });
    await page.route('http://127.0.0.1:8765/api/v1/computer/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      copies.push(route.request().postDataJSON());
      return route.fulfill({
        headers,
        json: {
          id: 'copy', status: 'staged', courseCount: 4, assignmentCount: 12,
          message: 'Approved coursework copy staged locally.',
          command: 'python3 sandbox/canvas_local/setup.py import --snapshot local-copy.json',
          limitations: ['File links remain references.'],
        },
      });
    });
    await openAutomation(page);
    const stage = page.getByRole('button', { name: 'Stage my Canvas courses', exact: true });
    expect(await stage.isDisabled()).toBe(true);
    const approval = page.getByLabel('I approve copying my visible Canvas coursework to the local replica.');
    await approval.check();
    await stage.click();
    await expect.poll(() => reads).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Cancel staging', exact: true }).click();
    release();
    await page.waitForTimeout(150);
    expect(copies).toHaveLength(0);
    await approval.check();
    await stage.click();
    await page.getByText('Approved coursework copy staged locally.', { exact: true }).waitFor();
    expect(copies).toHaveLength(1);
    expect(copies[0]?.origin).toBe(CANVAS_ORIGIN);
    expect(copies[0]?.cookies).toBeUndefined();
  } finally {
    release();
    await browser.close();
  }
}, 20000);
