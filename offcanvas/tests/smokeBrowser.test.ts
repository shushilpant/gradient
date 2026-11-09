import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

it('opens every primary workspace with OffCanvas branding and no uncaught runtime errors', async () => {
  const browser = await launchBrowser();
  try {
    const { page, requests } = await mockCanvas(browser);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await waitForLoaded(page);
    for (const name of ['Academics', 'AI Workspace', 'Automation', 'Research']) {
      const tab = page.getByRole('tab', { name, exact: true });
      await tab.click();
      expect(await tab.getAttribute('aria-selected')).toBe('true');
      const workspace = page.locator('#offcanvas-workspace');
      expect(await workspace.isVisible()).toBe(true);
      expect(await workspace.innerText()).toContain('OffCanvas');
      expect(await workspace.innerText()).not.toMatch(/\b(?:Bodha|Gradient)\b/i);
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 20000);

it('loads built settings, migrates legacy preferences, validates, saves, reloads and resets', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const state = window as unknown as { chrome: unknown; requestedOrigins: string[][]; grantSiteAccess: boolean };
      if (!localStorage.getItem('options-seeded')) {
        localStorage.setItem('gradient_user_options', JSON.stringify({ canvasHosts: ['canvas.school.edu'], courseCreditHours: { 'CS 101': 4 } }));
        localStorage.setItem('options-seeded', 'true');
      }
      state.requestedOrigins = [];
      state.grantSiteAccess = true;
      state.chrome = {
        runtime: {},
        storage: { local: {
          get: (key: string, callback: (values: Record<string, unknown>) => void) => callback({ [key]: JSON.parse(localStorage.getItem(key) || 'null') ?? undefined }),
          set: (values: Record<string, unknown>, callback: () => void) => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); callback(); },
          remove: async (key: string) => { localStorage.removeItem(key); },
        } },
        permissions: {
          request: async ({ origins }: { origins: string[] }) => { state.requestedOrigins.push(origins); return state.grantSiteAccess; },
          contains: async () => true,
        },
        scripting: {
          getRegisteredContentScripts: async () => [],
          registerContentScripts: async () => {},
          unregisterContentScripts: async () => {},
        },
      };
    });
    const base = 'https://offcanvas-options.test/';
    const html = readFileSync(new URL('../dist/extension/options/options.html', import.meta.url), 'utf8');
    const script = readFileSync(new URL('../dist/extension/options/options.js', import.meta.url), 'utf8');
    await page.route(base + '**', route => route.fulfill({ contentType: route.request().url().endsWith('options.js') ? 'application/javascript' : 'text/html', body: route.request().url().endsWith('options.js') ? script : html }));
    await page.goto(base);
    await page.getByLabel('CS 101 credit hours', { exact: true }).waitFor();
    expect(await page.title()).toBe('OffCanvas Settings & Options');
    expect(await page.locator('body').innerText()).not.toMatch(/\b(?:Bodha|Gradient)\b/i);
    expect(await page.evaluate(() => localStorage.getItem('gradient_user_options'))).toBeNull();
    const hosts = page.locator('#canvas-hosts');
    const save = page.getByRole('button', { name: 'Save Settings', exact: true });
    await hosts.fill('https://canvas.school.edu');
    await save.click();
    await page.getByText(/Use a hostname such as canvas.school.edu/).waitFor();
    await hosts.fill('canvas.other.edu');
    await page.getByLabel('CS 101 credit hours', { exact: true }).fill('5');
    await page.evaluate(() => { (window as unknown as { grantSiteAccess: boolean }).grantSiteAccess = false; });
    await save.click();
    await page.getByText('Site access was not granted. Settings were not changed.', { exact: true }).waitFor();
    await page.evaluate(() => { (window as unknown as { grantSiteAccess: boolean }).grantSiteAccess = true; });
    await save.click();
    await page.getByText('Saved. Refresh your Canvas tab to apply.', { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as unknown as { requestedOrigins: string[][] }).requestedOrigins)).toEqual([['https://canvas.other.edu/*'], ['https://canvas.other.edu/*']]);
    await page.reload();
    await expect.poll(() => page.getByLabel('CS 101 credit hours', { exact: true }).inputValue()).toBe('5');
    expect(await hosts.inputValue()).toBe('canvas.other.edu');
    await page.getByRole('button', { name: 'Reset Defaults', exact: true }).click();
    await page.getByText('Defaults restored. Refresh your Canvas tab to apply.', { exact: true }).waitFor();
    expect(await hosts.inputValue()).toContain('*.instructure.com');
    expect(await page.getByLabel('CS 101 credit hours', { exact: true }).count()).toBe(0);
    expect(await page.getByLabel('A GPA points', { exact: true }).inputValue()).toBe('4');
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 20000);
