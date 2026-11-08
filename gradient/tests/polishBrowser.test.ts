import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('Consolidated workspace settings and keyboard controls', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('keeps grade settings current and isolates preferences and scenarios on account changes', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.getByRole('button', { name: 'Grade Lab', exact: true }).click();
      await page.getByLabel('Study hours for LIVE-101').fill('8');
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      await page.getByLabel('Credit hours for LIVE-101').fill('10');
      await page.getByLabel('Credit hours for LIVE-101').press('Tab');
      await page.getByRole('button', { name: 'Grade Lab', exact: true }).click();
      expect(await page.locator('.gl-slider').first().innerText()).toContain('10 credit hours');
      expect(await page.getByLabel('Study hours for LIVE-101').inputValue()).toBe('8');
      await page.route('**/api/v1/users/self/profile', route => route.fulfill({ json: { id: 9992, name: 'Different Student', short_name: 'Different' } }));
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await page.getByLabel('Study hours for LIVE-101').waitFor();
      expect(await page.getByLabel('Study hours for LIVE-101').inputValue()).toBe('4');
      expect(await page.locator('.gl-slider').first().innerText()).toContain('3 credit hours');
      await page.getByRole('button', { name: 'Preferences', exact: true }).click();
      expect(await page.getByLabel('Credit hours for LIVE-101').inputValue()).toBe('3');
    } finally { await page.close(); }
  });

  it('offers exactly four primary sections and preserves keyboard and mobile access', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      expect(await page.getByRole('tab').allTextContents()).toEqual(['Academics','AI Workspace','Automation','Research']);
      const text = await page.locator('#gradient-workspace').innerText();
      expect(text).not.toMatch(/Study studio|Photo check|Command center|Audio revision|QR|Focus timer/);
      await page.getByRole('tab', { name: 'Academics', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      expect(await page.getByRole('tab', { name: 'AI Workspace', exact: true }).getAttribute('aria-selected')).toBe('true');
      await page.keyboard.press('End');
      expect(await page.getByRole('tab', { name: 'Research', exact: true }).getAttribute('aria-selected')).toBe('true');
      await page.keyboard.press('Home');
      expect(await page.getByRole('tab', { name: 'Academics', exact: true }).getAttribute('aria-selected')).toBe('true');
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.locator('.g-body').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Grade Lab', exact: true }).click();
      await page.getByRole('heading', { name: 'Explore your grades', exact: true }).waitFor();
      expect(await page.getByRole('tab', { name: 'Academics', exact: true }).isVisible()).toBe(true);
    } finally { await page.close(); }
  });

  it('carries the selected assignment into AI and returns to its grade and study controls', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.getByRole('button', { name: 'Coursework', exact: true }).click();
      await page.getByLabel('Assignment to simulate').selectOption('1008');
      await page.getByRole('button', { name: 'Explain assignment', exact: true }).click();
      expect(await page.getByLabel('Assistant assignment', { exact:true }).inputValue()).toBe('1008');
      await page.getByRole('button', { name: 'Grade implications, study plan & calendar', exact: true }).click();
      expect(await page.getByLabel('Assignment to simulate').inputValue()).toBe('1008');
      expect(await page.getByLabel('Study hours available').count()).toBe(1);
      expect(await page.getByRole('button', { name:'Download calendar (.ics)', exact:true }).count()).toBe(1);
    } finally { await page.close(); }
  });
  it('surfaces deadline and requirement changes after a refresh without the legacy command interface', async () => {
    let fixture: Array<Record<string, any>> = [];
    const { page } = await mockCanvas(browser, { configureData: courses => { fixture = courses; } });
    try {
      await waitForLoaded(page);
      await page.getByRole('status').filter({ hasText:'Baseline saved.' }).waitFor();
      const assignment = fixture[0]!.assignments[0];
      assignment.due_at = '2026-11-15T23:00:00Z';
      assignment.description = '<p>Include a newly required proof and a runtime analysis.</p>';
      await page.getByRole('button', { name:'Refresh Canvas data', exact:true }).click();
      const changes = page.getByRole('region', { name:'Canvas change radar', exact:true });
      await changes.getByText(/Deadline changed:/).waitFor();
      expect(await changes.innerText()).toContain('Requirements changed:');
      expect(await changes.innerText()).toContain('newly required proof');
      await changes.getByRole('button', { name:'Review coursework', exact:true }).first().click();
      expect(await page.getByLabel('Choose a course').inputValue()).toBe('99001');
    } finally { await page.close(); }
  });

});
