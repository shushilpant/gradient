import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas, bundle, waitForLoaded } from './browserHarness.js';

describe('Canvas extension isolation and authentication', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('shows a real authentication error instead of synthetic courses', async () => {
    const { page } = await mockCanvas(browser, { denied: true });
    try {
      await page.getByRole('alert').first().waitFor({ timeout: 10000 });
      const visible = await page.locator('#offcanvas-workspace').innerText();
      expect(visible).not.toContain('CS 101');
      expect(visible).not.toContain('Alex Chen');
      expect(visible).toMatch(/sign|session|connect|401|Canvas/i);
    } finally { await page.close(); }
  });

  it('blocks active assessments before creating a panel or making API calls', async () => {
    const { page, requests } = await mockCanvas(browser, { url: 'https://canvas.instructure.com/courses/99001/quizzes/501/take', html: '<div id="quiz_timer">45:00</div>' });
    try {
      expect(await page.locator('#offcanvas-panel-host').count()).toBe(0);
      expect(requests).toEqual([]);
    } finally { await page.close(); }
  });

  it('blocks assessment DOM markers even on an otherwise safe course path', async () => {
    const { page, requests } = await mockCanvas(browser, { html: '<form id="submit_quiz_form">Assessment</form>' });
    try {
      expect(await page.locator('#offcanvas-panel-host').count()).toBe(0);
      expect(requests).toEqual([]);
    } finally { await page.close(); }
  });

  it('removes an existing panel when Canvas navigates into an assessment', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.evaluate(() => {
        history.pushState({}, '', '/courses/99001/quizzes/501/take');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.locator('#offcanvas-panel-host').waitFor({ state: 'detached', timeout: 3000 });
    } finally { await page.close(); }
  });

  it('does not trust lookalike Canvas domains', async () => {
    const page = await browser.newPage();
    try {
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Untrusted host</body></html>' }));
      await page.goto('https://notinstructure.com/courses/99001');
      await page.evaluate(bundle());
      expect(await page.locator('#offcanvas-panel-host').count()).toBe(0);
    } finally { await page.close(); }
  });

  it('reuses coursework across module switches and navigation, but refreshes on demand', async () => {
    const { page, requests } = await mockCanvas(browser);
    const cache: Record<string, unknown> = {};
    try {
      await waitForLoaded(page);
      await page.exposeBinding('__courseCache', (_source, operation: string, key: string, value?: unknown) => {
        if (operation === 'get') return { [key]: cache[key] };
        if (operation === 'set') cache[key] = value;
        if (operation === 'remove') delete cache[key];
        return undefined;
      });
      const storageShim = () => {
        const rpc = (window as any).__courseCache;
        (window as any).chrome = { storage: { local: {
          get: (key: string, callback?: (value: unknown) => void) => rpc('get', key).then((value: unknown) => { callback?.(value); return value; }),
          set: async (entries: Record<string, unknown>) => { for (const [key, value] of Object.entries(entries)) await rpc('set', key, value); },
          remove: (key: string) => rpc('remove', key),
        } } };
      };
      await page.evaluate(storageShim);
      await page.addInitScript(storageShim);
      await page.addInitScript({ content: bundle() });
      // Prime the extension cache using the normal explicit-refresh path.
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await waitForLoaded(page);
      await expect.poll(() => Object.keys(cache).filter(key => key.startsWith('gradient_course_snapshot_v1:')).length).toBe(1);
      const courseReads = () => requests.filter(request => request.path.startsWith('/api/v1/courses')).length;
      const synced = courseReads();
      for (const name of ['Automation', 'AI Workspace', 'Research', 'Academics']) {
        await page.getByRole('tab', { name, exact: true }).click();
      }
      expect(courseReads()).toBe(synced);
      await page.goto('https://canvas.instructure.com/courses/99001/modules');
      await waitForLoaded(page);
      expect(courseReads()).toBe(synced);
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await waitForLoaded(page);
      expect(courseReads()).toBeGreaterThan(synced);
      // A cached snapshot must never outlive authentication.
      await page.route('**/api/v1/users/self/profile', route => route.fulfill({ status: 401, json: {} }));
      await page.goto('https://canvas.instructure.com/courses/99001');
      await page.getByRole('alert').first().waitFor();
      expect(await page.locator('#offcanvas-workspace').innerText()).not.toContain('Live Systems Lab');
      await expect.poll(() => Object.keys(cache).filter(key => key.startsWith('gradient_course_snapshot_v1:')).length).toBe(0);
    } finally { await page.close(); }
  }, 20000);

});
