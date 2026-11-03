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
      const visible = await page.locator('#gradient-workspace').innerText();
      expect(visible).not.toContain('CS 101');
      expect(visible).not.toContain('Alex Chen');
      expect(visible).toMatch(/sign|session|connect|401|Canvas/i);
    } finally { await page.close(); }
  });

  it('blocks active assessments before creating a panel or making API calls', async () => {
    const { page, requests } = await mockCanvas(browser, { url: 'https://canvas.instructure.com/courses/99001/quizzes/501/take', html: '<div id="quiz_timer">45:00</div>' });
    try {
      expect(await page.locator('#gradient-panel-host').count()).toBe(0);
      expect(requests).toEqual([]);
    } finally { await page.close(); }
  });

  it('blocks assessment DOM markers even on an otherwise safe course path', async () => {
    const { page, requests } = await mockCanvas(browser, { html: '<form id="submit_quiz_form">Assessment</form>' });
    try {
      expect(await page.locator('#gradient-panel-host').count()).toBe(0);
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
      await page.locator('#gradient-panel-host').waitFor({ state: 'detached', timeout: 3000 });
    } finally { await page.close(); }
  });

  it('does not trust lookalike Canvas domains', async () => {
    const page = await browser.newPage();
    try {
      await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Untrusted host</body></html>' }));
      await page.goto('https://notinstructure.com/courses/99001');
      await page.evaluate(bundle());
      expect(await page.locator('#gradient-panel-host').count()).toBe(0);
    } finally { await page.close(); }
  });
});
