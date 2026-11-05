import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('Canvas launch snapshot memory', () => {
 let browser: Browser;
 beforeAll(async () => { browser = await launchBrowser(); });
 afterAll(async () => { await browser?.close(); });
 it('syncs once at launch and reuses courses across modes, tools, and Canvas navigation', async () => {
  const { page, requests } = await mockCanvas(browser);
  try {
   await waitForLoaded(page);
   const syncs = () => requests.filter(request => request.path.startsWith('/api/v1/users/self/profile')).length;
   expect(syncs()).toBe(1);
   const initialCount = requests.length;
   await page.getByRole('button', { name: 'Use auto mode', exact: true }).click();
   await page.getByRole('button', { name: 'Use manual mode', exact: true }).click();
   for (const name of ['Coursework', 'Resources', 'Overview']) await page.getByRole('tab', { name, exact: true }).click();
   await page.getByRole('button', { name: /^Study studio/ }).click();
   await page.getByRole('textbox', { name: 'Study topic' }).fill('Keep this topic in working memory');
   await page.getByRole('button', { name: /^Command center/ }).click();
   await page.getByRole('button', { name: /^Study studio/ }).click();
   expect(await page.getByRole('textbox', { name: 'Study topic' }).inputValue()).toContain('working memory');
   await page.evaluate(() => { history.pushState({}, '', '/courses/99002'); window.dispatchEvent(new PopStateEvent('popstate')); });
   await page.waitForTimeout(1200);
   expect(requests.length).toBe(initialCount);
   expect(syncs()).toBe(1);
   await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
   await page.waitForFunction(() => !document.querySelector('#gradient-panel-host')?.shadowRoot?.querySelector('button[aria-label="Refresh Canvas data"]')?.hasAttribute('disabled'));
   expect(syncs()).toBe(2);
  } finally { await page.close(); }
 }, 20000);
});
