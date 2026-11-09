import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { launchBrowser, bundle } from './browserHarness.js';

describe('Explicit local demo preview', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('labels synthetic data as a demo and never calls Canvas', async () => {
    const page = await browser.newPage({ timezoneId: 'America/Chicago', viewport: { width: 375, height: 812 } });
    const apiRequests: string[] = [];
    try {
      await page.route('**/*', route => {
        if (route.request().url().includes('/api/')) apiRequests.push(route.request().url());
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>Local preview</main></body></html>' });
      });
      await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
      await page.goto('http://127.0.0.1:8086/courses/99001');
      await page.evaluate(bundle('preview'));
      await page.getByText('Synthetic demo', { exact: true }).first().waitFor({ timeout: 10000 });
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      expect(await page.locator('#offcanvas-panel-host').count()).toBe(1);
      await page.getByRole('heading', { name: /Graph traversal planning is due tomorrow and has the biggest grade impact in CS-101/ }).waitFor();
      expect(await page.locator('.g-greeting .g-lede').innerText()).toBe('Probability study outline is next. Enzyme experiment is due Wednesday.');
      expect(await page.getByRole('button', { name: '30 min', exact: true }).count()).toBe(0);
      await page.getByRole('button', { name: 'Panic button', exact: true }).click();
      await page.getByRole('button', { name: '30 min', exact: true }).click();
      expect(await page.locator('.g-quick-result').innerText()).toContain('Start with 30 min on Graph traversal planning.');
      expect(await page.getByRole('link', { name: /Start .* in Canvas/ }).count()).toBe(0);
      await page.getByRole('button', { name: '2 hrs', exact: true }).click();
      expect(await page.locator('.g-quick-result').innerText()).toContain('Start with 90 min on Graph traversal planning.');
      expect(await page.locator('.g-body').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Open assignment', exact: true }).click();
      expect(await page.getByLabel('Assignment to simulate').inputValue()).toBe('1091');
      await page.getByRole('button', { name: 'Grade target', exact: true }).click();
      expect(await page.getByLabel('Target course grade').evaluate(el => el.matches(':focus'))).toBe(true);
      await page.getByLabel('Target course grade').selectOption('B+');
      expect(await page.locator('.g-grade-target [aria-live]').innerText()).toBe('82% on this assignment reaches B+ or higher.');
      await page.getByText('Marking criteria and feedback', { exact: true }).click();
      const criterion = page.getByRole('checkbox', { name: 'Queue states and traversal reasoning' });
      await criterion.check();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await page.getByRole('button', { name: 'Coursework', exact: true }).click();
      await page.getByText('Marking criteria and feedback', { exact: true }).click();
      await expect.poll(() => criterion.isChecked()).toBe(true);
      await page.getByRole('button', { name: 'Build my study plan', exact: true }).click();
      const total = page.locator('.g-plan-total');
      await total.waitFor();
      expect(await total.innerText()).toBe('4.5 of 8 hours allocated. 3.5 hours unallocated.');
      expect(await page.locator('.g-plan-row').filter({ hasText: 'Final Exam' }).locator('.g-plan-hours').innerText()).toBe('0.5 h');
      await page.getByText('Add first study block to calendar', { exact: true }).click();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download .ics', exact: true }).click();
      const file = await downloaded;
      expect(file.suggestedFilename()).toBe('offcanvas-study-block.ics');
      const contents = readFileSync((await file.path())!, 'utf8');
      expect(contents).toMatch(/DTSTART:\d{8}T\d{6}Z\r\nDTEND:\d{8}T\d{6}Z/);
      expect(await page.locator('.g-body').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

      await page.getByRole('button', { name: 'Present', exact: true }).click();
      await page.getByRole('button', { name: 'Demo Academics', exact: true }).click();
      const split = page.getByRole('region', { name: 'Suggested study split', exact: true });
      await split.waitFor({ timeout: 18000 });
      const exam = split.locator('.g-demo-row').filter({ hasText: 'Final Exam' });
      expect(await exam.locator('.g-due').innerText()).toBe('0.5 hrs');
      expect(await exam.innerText()).toContain('Full credit adds 30 percentage points to the final grade');
      expect(await split.getByRole('status').innerText()).toBe('4.5 of 8.0 hours allocated · 3.5 hours unallocated.');
      expect(apiRequests).toEqual([]);
    } finally { await page.close(); }
  }, 35000);
});
