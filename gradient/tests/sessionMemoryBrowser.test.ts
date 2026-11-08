import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('Shared Canvas launch context', () => {
 let browser: Browser;
 beforeAll(async () => { browser = await launchBrowser(); });
 afterAll(async () => { await browser?.close(); });
 it('reuses one sync across all four sections and retains editable Research topics', async () => {
  const { page, requests } = await mockCanvas(browser);
  try {
   await waitForLoaded(page);
   const syncs = () => requests.filter(request => request.path.startsWith('/api/v1/courses?')).length;
   expect(syncs()).toBe(1);
   const initialCount = requests.length;
   for (const name of ['AI Workspace', 'Automation', 'Research']) await page.getByRole('tab', { name, exact: true }).click();
   await page.getByLabel('REU research topics').fill('Keep this academic interest');
   await page.getByRole('tab', { name:'Academics', exact: true }).click();
   for (const name of ['Coursework', 'Resources', 'Overview']) await page.getByRole('button', { name, exact: true }).click();
   await page.getByRole('tab', { name:'Research', exact: true }).click();
   expect(await page.getByLabel('REU research topics').inputValue()).toBe('Keep this academic interest');
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
