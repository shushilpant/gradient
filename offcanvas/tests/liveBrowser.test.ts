import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('Signed-in Canvas session integration', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('renders API course data inside the original Canvas tab using GET requests', async () => {
    const { page, requests } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      expect(await page.locator('#offcanvas-panel-host').count()).toBe(1);
      expect(await page.locator('#canvas-original').innerText()).toBe('Original Canvas course content');
      expect(requests.some(request => request.path.startsWith('/api/v1/courses'))).toBe(true);
      expect(requests.some(request => request.path.includes('/assignments'))).toBe(true);
      expect(requests.some(request => request.path.includes('/students/submissions'))).toBe(true);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
      expect(await page.locator('#offcanvas-workspace').innerText()).not.toContain('Alex Chen');
    } finally { await page.close(); }
  }, 20000);
});
