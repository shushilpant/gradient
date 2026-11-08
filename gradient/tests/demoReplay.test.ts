import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, bundle } from './browserHarness.js';

describe('Explicit local demo preview', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('labels synthetic data as a demo and never calls Canvas', async () => {
    const page = await browser.newPage();
    const apiRequests: string[] = [];
    try {
      await page.route('**/*', route => {
        if (route.request().url().includes('/api/')) apiRequests.push(route.request().url());
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>Local preview</main></body></html>' });
      });
      await page.goto('http://127.0.0.1:8086/courses/99001');
      await page.evaluate(bundle('preview'));
      await page.getByText('Synthetic demo', { exact: true }).first().waitFor({ timeout: 10000 });
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      await page.getByText('Homework: Graph traversal planning', { exact: true }).first().waitFor();
      expect(await page.locator('#gradient-panel-host').count()).toBe(1);
      expect(apiRequests).toEqual([]);
    } finally { await page.close(); }
  });
});
