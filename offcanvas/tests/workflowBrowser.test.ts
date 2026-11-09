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
const legacyCoursePath = '/courses/99002';
const assignmentName = 'Homework: Time-shift response';
const assignmentBrief = 'Plot the shifted response on 0 ≤ t ≤ 8 and explain its maximum.';
const panicCoursePath = '/courses/99002';
const panicAssignmentPath = panicCoursePath + '/assignments/1001';
const panicCourseCode = 'CE 240 H001';
const panicAssignmentName = 'Homework 1 - Amplitude Spectrum Derivation';
const panicAssignmentBrief = 'Derive the amplitude spectrum from the pulse signal Fourier coefficients and plot its harmonics.';
const panicPages: Record<string, string> = {
  [panicCoursePath]: `<h1>${panicCourseCode}</h1><a href="${panicCoursePath}/assignments">Assignments</a>`,
  [panicCoursePath + '/assignments']: `<h1>Course assignments</h1><a href="${panicAssignmentPath}">${panicAssignmentName}</a>`,
  [panicAssignmentPath]: `<h1>${panicAssignmentName}</h1><p id="assignment-brief">${panicAssignmentBrief}</p>`,
};
const nativePages: Record<string, string> = {
  '/': `<h1>Canvas dashboard</h1><a href="${coursePath}" target="_blank">OFFCANVAS-SIGNALS</a>`,
  [coursePath]: `<h1>Signals and Systems</h1><a href="${coursePath}/assignments">Assignments</a>`,
  [coursePath + '/assignments']: `<h1>Course assignments</h1><a href="${assignmentPath}">${assignmentName}</a>`,
  [assignmentPath]: `<h1>${assignmentName}</h1><p id="assignment-brief">${assignmentBrief}</p>`,
};

async function openAutomation(page: Page) {
  page.setDefaultTimeout(10000);
  await waitForLoaded(page);
  await page.getByRole('tab', { name: 'Automation', exact: true }).click();
}

for (const origin of [CANVAS_ORIGIN, localCanvas]) {
  it(`explains the saved demo requirements at ${origin}`, async () => {
    const browser = await launchBrowser();
    try {
      // The replica has usable homework with the same title under a different course.
      const { page } = origin === localCanvas
        ? await mockLocalWorkflow(browser, { courseCode: 'CE 240' })
        : await mockCanvas(browser, { origin });
      await openAutomation(page);
      if (origin === localCanvas) await page.getByText('Live models unavailable', { exact: true }).waitFor();
      const startingUrl = page.url();
      const requests: string[] = [];
      await page.route('**/*', route => {
        requests.push(route.request().url());
        return route.abort();
      });
      const demo = page.getByRole('button', { name: 'Demo automation', exact: true });
      expect(await demo.isEnabled()).toBe(true);
      await demo.click();
      await page.getByRole('alert').filter({ hasText: origin === localCanvas
        ? 'Seed OFFCANVAS-SIGNALS in the local Canvas replica, then refresh Canvas to run the demo.'
        : 'Open the signed-in local Canvas replica' }).waitFor();
      expect(page.url()).toBe(startingUrl);
      expect(await page.locator('#offcanvas-automation-cursor').count()).toBe(0);
      expect(await page.getByRole('region', { name: 'Automatic reference sample', exact: true }).count()).toBe(0);
      expect(requests.filter(url => url !== 'http://127.0.0.1:8765/api/v1/assistant/health')).toEqual([]);
      expect(await demo.isEnabled()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 25000);
}

async function mockLocalWorkflow(browser: Browser, options: {
  hostileCursorStyles?: boolean;
  includeLegacyCourse?: boolean;
  includePanicCourse?: boolean;
  courseCode?: string;
  panicTarget?: boolean;
} = {}) {
  const { hostileCursorStyles, includeLegacyCourse, includePanicCourse, courseCode = 'OFFCANVAS-SIGNALS', panicTarget } = options;
  const mocked = await mockCanvas(browser, {
    origin: localCanvas,
    url: localCanvas + '/',
    persistContent: true,
    fixedTime: panicTarget ? '2026-11-09T12:00:00Z' : undefined,
    pageHtml(url) {
      const styles = hostileCursorStyles ? '<style>svg{display:none!important}path{fill:blue!important}body{cursor:default}a{cursor:pointer}</style>' : '';
      if (includePanicCourse && url.pathname === '/') {
        return styles + nativePages['/'] + `<a href="${panicCoursePath}">${panicCourseCode}</a>`;
      }
      if (includePanicCourse && panicPages[url.pathname]) return styles + panicPages[url.pathname];
      if (includeLegacyCourse && url.pathname === '/') {
        return styles + nativePages['/'] + `<a href="${legacyCoursePath}" target="_blank">GRADIENT-SIGNALS</a>`;
      }
      const legacyPage = includeLegacyCourse && url.pathname.startsWith(legacyCoursePath);
      const pathname = legacyPage ? url.pathname.replace(legacyCoursePath, coursePath) : url.pathname;
      const page = nativePages[pathname] ?? '<h1>Unknown Canvas page</h1>';
      return styles + (legacyPage ? page.replaceAll(coursePath, legacyCoursePath) : page.replace('OFFCANVAS-SIGNALS', courseCode));
    },
    configureData(courses) {
      const demoAssignment = {
        name: assignmentName,
        description: `<p>${assignmentBrief}</p>`,
      };
      courses[0]!.course.course_code = courseCode;
      Object.assign(courses[0]!.assignments[0], demoAssignment);
      if (panicTarget) {
        const course = courses[0]!;
        course.assignments[0].due_at = '2026-11-09T13:00:00Z';
        course.submissions = course.submissions.filter((item: { assignment_id: number }) => item.assignment_id !== 1001);
        course.assignments[1].description = '<p>Compare two sorting algorithms and explain their runtime.</p>';
      }
      if (includeLegacyCourse) {
        courses[1]!.course.course_code = 'GRADIENT-SIGNALS';
        Object.assign(courses[1]!.assignments[0], demoAssignment);
      }
      if (includePanicCourse) {
        const course = courses[1]!;
        course.course.course_code = panicCourseCode;
        Object.assign(course.assignments[0], {
          id: 1001, name: panicAssignmentName, description: `<p>${panicAssignmentBrief}</p>`,
        });
      }
    },
  });
  const { page } = mocked;
  const openedPages: Page[] = [];
  const navigation: string[] = [];
  page.context().on('page', newPage => openedPages.push(newPage));
  // Page routes handle the original tab. A popup has no fixture or network access.
  await page.context().route('**/*', route => route.abort());
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navigation.push(new URL(frame.url()).pathname);
  });
  return { ...mocked, openedPages, navigation };
}

it('replays OFFCANVAS-SIGNALS ahead of its legacy alias from Automation with no model service', async () => {
  const browser = await launchBrowser();
  let releaseSync = () => {};
  const slowSync = new Promise<void>(resolve => { releaseSync = resolve; });
  try {
    const { page, requests, openedPages, navigation } = await mockLocalWorkflow(browser, { includeLegacyCourse: true });
    await page.evaluate(() => document.addEventListener('click', event => {
      const anchor = (event.target as Element).closest('a');
      if (anchor) sessionStorage.setItem('demo-clicked-course', anchor.pathname);
    }, true));
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
    expect(await demo.isEnabled()).toBe(true);
    expect(await start.evaluate(button => button.nextElementSibling?.textContent?.trim())).toBe('Demo automation');
    const actionTimes = [performance.now()];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) actionTimes.push(performance.now());
    });
    await demo.click();
    deferSync = true;
    await page.waitForURL(localCanvas + assignmentPath, { timeout: 15000 });
    expect(await page.evaluate(() => sessionStorage.getItem('demo-clicked-course'))).toBe(coursePath);
    expect(await page.locator('#assignment-brief').innerText()).toBe(assignmentBrief);
    await page.locator('#offcanvas-page-control').getByRole('status').filter({ hasText: 'Preparing the reference assignment' }).waitFor();
    const pauseObservedAt = performance.now();
    actionTimes.push(pauseObservedAt);
    expect(actionTimes).toHaveLength(5);
    for (const [index, time] of actionTimes.slice(1).entries()) {
      expect(time - actionTimes[index]!).toBeGreaterThan(2000);
    }
    const result = page.getByRole('region', { name: 'Automatic reference sample', exact: true });
    expect(await result.count()).toBe(0);
    const playback = page.locator('#offcanvas-page-control').getByRole('status');
    await playback.filter({hasText:'Taking another look at the stored graph'}).waitFor();
    expect(await playback.innerText()).toContain('Saved replay');
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor({ timeout: 15000 });
    expect(performance.now() - pauseObservedAt).toBeGreaterThan(9000);
    await result.getByRole('heading', { name: 'Saved reference assignment', exact: true }).waitFor();
    await result.getByRole('heading', { name: assignmentName, exact: true }).waitFor();
    const plot = result.getByRole('img', { name: /response is zero through t = 2/ });
    await expect.poll(() => plot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 800)).toBe(true);
    expect(await result.getByText(localCanvas + assignmentPath, { exact: true }).isVisible()).toBe(true);
    expect(navigation).toEqual([coursePath, coursePath + '/assignments', assignmentPath]);
    expect(backendCalls.every(call => call === '/api/v1/assistant/health')).toBe(true);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(openedPages).toEqual([]);
    expect(page.context().pages()).toEqual([page]);
  } finally {
    releaseSync();
    await browser.close();
  }
}, 35000);

it('replays the BODHA-SIGNALS alias from Present and keeps its cursor separate from the native cursor', async () => {
  const browser = await launchBrowser();
  try {
    const { page, openedPages } = await mockLocalWorkflow(browser, { hostileCursorStyles: true, courseCode: 'BODHA-SIGNALS' });
    await page.route('http://127.0.0.1:8765/**', route => route.abort());
    await openAutomation(page);
    const nativeCursors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).cursor,
      link: getComputedStyle(document.querySelector('a')!).cursor,
    }));
    const cursor = page.locator('#offcanvas-automation-cursor');
    expect(await cursor.count()).toBe(0);
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Automation', exact: true }).click();

    const expectVisibleRustCursor = async () => {
      const observed = await cursor.locator('svg').evaluate(node => {
        const link = document.querySelector('#canvas-original a');
        return {
          display: getComputedStyle(node).display,
          color: getComputedStyle(node.querySelector('path')!).fill,
          width: node.getBoundingClientRect().width,
          body: getComputedStyle(document.body).cursor,
          link: link ? getComputedStyle(link).cursor : undefined,
        };
      }, undefined, { timeout: 2500 });
      expect(observed.display).toBe('block');
      expect(observed.color).toBe('rgb(166, 75, 42)');
      expect(observed.width).toBe(19);
      expect(observed.body).toBe(nativeCursors.body);
      if (observed.link) expect(observed.link).toBe(nativeCursors.link);
    };
    await expectVisibleRustCursor();
    await page.waitForURL(localCanvas + assignmentPath);
    await expectVisibleRustCursor();
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor({ timeout: 8000 });
    expect(await cursor.count()).toBe(0);
    expect(openedPages).toEqual([]);

    // Stop remains available while the demo button run prepares its saved result.
    await page.getByRole('button', { name: 'Demo automation', exact: true }).click();
    const controls = page.locator('#offcanvas-page-control');
    await controls.getByRole('status').filter({ hasText: 'Preparing the reference assignment' }).waitFor({ timeout: 15000 });
    await controls.getByRole('button', { name: 'Stop run', exact: true }).click();
    expect(await cursor.count()).toBe(0);
    await page.getByRole('heading', { name: 'Run stopped', exact: true }).waitFor();
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe(nativeCursors.body);
  } finally {
    await browser.close();
  }
}, 35000);

it('replays CE 240 Homework 1 for Panic and clears its answer before the dedicated Automation demo', async () => {
  const browser = await launchBrowser();
  try {
    const { page, requests, openedPages, navigation } = await mockLocalWorkflow(browser, { includePanicCourse: true });
    const trackClicks = () => document.addEventListener('click', event => {
      const anchor = (event.target as Element).closest('a');
      if (anchor && !anchor.closest('#offcanvas-panel-host')) {
        const clicks = JSON.parse(sessionStorage.getItem('panic-main-clicks') || '[]');
        sessionStorage.setItem('panic-main-clicks', JSON.stringify([...clicks, anchor.pathname]));
      }
    }, true);
    await page.addInitScript(trackClicks);
    await page.evaluate(trackClicks);
    const backendCalls: string[] = [];
    await page.route('http://127.0.0.1:8765/**', route => {
      backendCalls.push(route.request().url());
      return route.abort();
    });
    await waitForLoaded(page);
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Academics', exact: true }).click();
    await page.getByRole('button', { name: 'Demo panic automation', exact: true }).click();
    const assessment = page.getByRole('dialog', { name: 'Assessment check passed', exact: true });
    expect(await assessment.count()).toBe(0);
    expect(await page.locator('#offcanvas-panel-host').evaluate(host => getComputedStyle(host).display)).toBe('none');
    await page.waitForURL(localCanvas + panicAssignmentPath);
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor();
    const check = page.getByRole('status', { name: 'Assessment check', exact: true });
    expect(await check.innerText()).toContain('regular homework, so the saved automation continued');
    expect(await page.locator('#assignment-brief').innerText()).toBe(panicAssignmentBrief);
    expect(navigation).toEqual([panicCoursePath, panicCoursePath + '/assignments', panicAssignmentPath]);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('panic-main-clicks') || '[]'))).toEqual([
      panicCoursePath, panicCoursePath + '/assignments', panicAssignmentPath,
    ]);
    const result = page.getByRole('region', { name: 'Automatic reference sample', exact: true });
    expect(await result.innerText()).toContain(panicAssignmentName);
    expect(await result.innerText()).toContain('Start with the Fourier coefficients');
    expect(await result.locator('.katex').count()).toBeGreaterThan(0);
    const panicPlot = result.getByRole('img', { name: /Normalized pulse waveform and one-sided amplitude spectrum/ });
    await expect.poll(() => panicPlot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 800)).toBe(true);

    await page.getByRole('tab', { name: 'Automation', exact: true }).click();
    await page.getByRole('button', { name: 'Demo automation', exact: true }).click();
    expect(await assessment.count()).toBe(0);
    expect(await result.count()).toBe(0);
    expect(await page.getByRole('heading', { name: panicAssignmentName, exact: true }).count()).toBe(1);
    await page.waitForURL(localCanvas + assignmentPath);
    await page.getByRole('heading', { name: 'Saved demo result ready', exact: true }).waitFor({ timeout: 15000 });
    expect(await result.innerText()).toContain(assignmentName);
    expect(await result.innerText()).not.toContain(panicAssignmentName);
    expect(navigation).toEqual([
      panicCoursePath, panicCoursePath + '/assignments', panicAssignmentPath,
      coursePath, coursePath + '/assignments', assignmentPath,
    ]);
    expect(backendCalls).toEqual([]);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(openedPages).toEqual([]);
    expect(page.context().pages()).toEqual([page]);
  } finally {
    await browser.close();
  }
}, 45000);

it('hands the Panic priority to the existing read-only Canvas workflow and requires fresh approval', async () => {
  const browser = await launchBrowser();
  try {
    const { page, requests, openedPages, navigation } = await mockLocalWorkflow(browser, { panicTarget: true });
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
        return route.fulfill({ headers, json: { ok: true, ollamaConnected: true, models: ['qwen3:30b-a3b-thinking-2507-q8_0'] } });
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
    const coursework = page.getByLabel('Workflow coursework', { exact: true });
    const goal = page.getByLabel('Automatic workflow goal', { exact: true });
    const approval = page.getByLabel('I approve this read-only workflow in the local sandbox shown above.');
    await coursework.selectOption('99001:1002');
    expect(await goal.inputValue()).toContain('HW 2: Sorting and Divide & Conquer');
    await approval.check();
    expect(await start.isDisabled()).toBe(true);

    await page.getByRole('tab', { name: 'Academics', exact: true }).click();
    await page.getByRole('button', { name: 'Panic button', exact: true }).click();
    const priorities = page.getByRole('region', { name: 'Deadline priorities', exact: true });
    await priorities.getByRole('button', { name: 'Automate assignment', exact: true }).click();
    expect(await page.getByRole('tab', { name: 'Automation', exact: true }).getAttribute('aria-selected')).toBe('true');
    await expect.poll(() => coursework.inputValue()).toBe('99001:1001');
    expect(await goal.inputValue()).toContain(assignmentName);
    expect(await goal.inputValue()).toContain('OFFCANVAS-SIGNALS');
    expect(await approval.isChecked()).toBe(false);
    expect(await start.isDisabled()).toBe(true);
    await page.getByLabel('This is homework, not an exam, quiz, or timed assessment.',{exact:true}).check();
    await start.click();
    await page.getByRole('alert').filter({hasText:'Check the workflow approval box above'}).waitFor();
    expect(navigation).toEqual([]);
    expect(jobs).toHaveLength(0);

    await page.getByLabel('Allow optional public web research for supporting concepts').uncheck();
    await page.getByLabel('This is homework, not an exam, quiz, or timed assessment.',{exact:true}).check();
    await approval.check();
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
    expect(navigation.at(-1)).toBe(assignmentPath);
    expect(navigation.every(path => Object.hasOwn(nativePages, path))).toBe(true);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(openedPages).toEqual([]);
    expect(page.context().pages()).toEqual([page]);
  } finally {
    await browser.close();
  }
}, 20000);

it('shows local-copy guidance when Panic picks institutional coursework', async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await mockCanvas(browser, {
      fixedTime: '2026-11-09T12:00:00Z',
      configureData(courses) {
        const course = courses[0]!;
        Object.assign(course.assignments[0], { name: assignmentName, description: `<p>${assignmentBrief}</p>`, due_at: '2026-11-09T13:00:00Z' });
        course.submissions = course.submissions.filter((item: { assignment_id: number }) => item.assignment_id !== 1001);
      },
    });
    await waitForLoaded(page);
    const startingUrl = page.url();
    const requests: string[] = [];
    await page.route('**/*', route => {
      requests.push(route.request().url());
      return route.abort();
    });
    await page.getByRole('button', { name: 'Panic button', exact: true }).click();
    await page.getByRole('region', { name: 'Deadline priorities', exact: true })
      .getByRole('button', { name: 'Automate assignment', exact: true }).click();
    const workflow = page.getByRole('region', { name: 'Automatic sandbox workflow', exact: true });
    await workflow.getByText('Selected in Panic mode', { exact: true }).waitFor();
    expect(await workflow.getByLabel('Workflow coursework').inputValue()).toBe('99001:1001');
    expect(await workflow.getByRole('link', { name: 'signed-in local Canvas replica', exact: true }).getAttribute('href')).toBe(localCanvas + '/');
    expect(await workflow.getByRole('button', { name: 'Start automatic workflow', exact: true }).isDisabled()).toBe(true);
    expect(page.url()).toBe(startingUrl);
    expect(requests).toEqual([]);
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
