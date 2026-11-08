import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('GRADIENT Canvas workspace', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  async function tab(page: Page, name: string): Promise<void> {
    if (name === 'Settings') name = 'Preferences';
    await page.getByRole('tab', { name: 'Academics', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    expect(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')).toBe('true');
  }

  it('supports course navigation, real coursework search, and what-if simulation', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.screenshot({ path: '/tmp/gradient-workspace-compact.png' });
      await tab(page, 'Coursework');
      expect(await page.getByLabel('Choose a course').inputValue()).toBe('99001');
      await page.getByRole('button', { name: 'All work', exact: true }).click();
      const search = page.getByLabel('Search coursework');
      await search.fill('Final Project');
      expect(await page.locator('.g-task').getByText(/Final Project Implementation/).count()).toBeGreaterThan(0);
      await search.fill('no assignment has this exact query');
      expect(await page.locator('.g-task').getByText(/Final Project Implementation/).count()).toBe(0);
      await search.fill('');
      const assignment = page.getByLabel('Assignment to simulate');
      await assignment.selectOption('1008');
      const slider = page.getByLabel('What-if score percentage');
      await slider.evaluate((element) => { const input = element as HTMLInputElement; input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.getElementById('gradient-panel-host')?.shadowRoot?.querySelector<HTMLInputElement>('[aria-label=\"What-if score percentage\"]')?.value === '20');
      const lowResult = await page.locator('.g-whatif-result').innerText();
      await slider.evaluate((element) => { const input = element as HTMLInputElement; input.value = '95'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.getElementById('gradient-panel-host')?.shadowRoot?.querySelector<HTMLInputElement>('[aria-label=\"What-if score percentage\"]')?.value === '95');
      expect(await page.locator('.g-whatif-result').innerText()).not.toBe(lowResult);
      await page.getByLabel('Choose a course').selectOption('99002');
      expect(await page.getByLabel('Choose a course').inputValue()).toBe('99002');
    } finally { await page.close(); }
  }, 20000);

  it('shows actual course resources, announcements, and restricted access notices', async () => {
    const { page } = await mockCanvas(browser, { resourceDenied: true });
    try {
      await waitForLoaded(page);
      await tab(page, 'Resources');
      expect(await page.getByRole('link', { name: /Signals study guide/ }).count()).toBeGreaterThan(0);
      expect(await page.getByText('Office hours this week', { exact: false }).count()).toBeGreaterThan(0);
      const search = page.getByLabel('Search resources');
      await search.fill('not a real resource');
      expect(await page.getByRole('link', { name: /Signals study guide/ }).count()).toBe(0);
      await search.fill('');
      await tab(page, 'Settings');
      expect(await page.locator('#gradient-workspace').innerText()).toMatch(/restrict|limited|access/i);
    } finally { await page.close(); }
  }, 20000);

  it('recovers linked course materials when the Pages and Files indexes are unavailable', async () => {
    const { page } = await mockCanvas(browser, { resourceDenied: true, pagesDenied: true });
    try {
      await waitForLoaded(page);
      await tab(page, 'Resources');
      const file = page.getByRole('link', { name: /Module lecture notes\.pdf/ });
      expect(await file.count()).toBe(1);
      expect(await file.getAttribute('href')).toBe('https://canvas.instructure.com/courses/99001/modules/items/702');
      expect(await page.getByRole('link', { name: /Signals study guide/ }).count()).toBe(1);
      expect(await page.getByRole('link', { name: /Locked exam answers/ }).count()).toBe(0);
      const access = page.getByRole('region', { name: 'Material access', exact: true });
      expect(await access.innerText()).toMatch(/linked|module/i);
      expect(await access.innerText()).toContain('Files');
      expect(await access.innerText()).toContain('Pages');
      await access.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/gradient-material-access.png' });
      await tab(page, 'Settings');
      const workspace = await page.locator('#gradient-workspace').innerText();
      expect(workspace).toContain('Course materials');
      expect(workspace).not.toContain('restricted or unavailable sections');
      expect(workspace).toContain("Canvas does not expose this course's Pages index");
      expect(workspace).toContain('Canvas checks access when you open each item.');
      expect(await page.locator('.g-issue-details').count()).toBe(0);
    } finally { await page.close(); }
  }, 20000);

  it('keeps real Canvas server failures visible even when module links are recovered', async () => {
    const { page } = await mockCanvas(browser, { filesServerError: true });
    try {
      await waitForLoaded(page);
      await tab(page, 'Resources');
      expect(await page.getByRole('link', { name: /Module lecture notes\.pdf/ }).count()).toBe(1);
      await tab(page, 'Settings');
      const issues = page.locator('.g-issue-details');
      await issues.locator('summary').click();
      expect(await issues.innerText()).toContain('HTTP 500');
      expect(await issues.innerText()).toContain('Files');
    } finally { await page.close(); }
  }, 20000);

  it('builds a study allocation and downloads an actual iCalendar file', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await tab(page, 'Coursework');
      await page.getByLabel('Study hours available').fill('4');
      await page.getByLabel('Study hours available').press('Tab');
      await page.getByRole('button', { name: 'Build my study plan', exact: true }).click();
      await page.locator('.g-plan-result').waitFor({ timeout: 15000 });
      expect(await page.locator('.g-plan-result').innerText()).toContain('hours allocated');
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download calendar (.ics)', exact: true }).click();
      const file = await downloaded;
      expect(file.suggestedFilename()).toBe('gradient-canvas-deadlines.ics');
      const downloadedPath = await file.path();
      expect(downloadedPath).not.toBeNull();
      const contents = readFileSync(downloadedPath!, 'utf8');
      expect(contents).toContain('BEGIN:VCALENDAR');
      expect(contents).toContain('END:VCALENDAR');
      expect(contents).toContain('BEGIN:VEVENT');
      expect(contents).toContain('UID:gradient-');
    } finally { await page.close(); }
  }, 20000);

  it('refreshes session data and keeps controls usable in compact and wide views', async () => {
    const { page, requests } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      const initialRequests = requests.length;
      const refreshed = page.waitForResponse(response => response.url().includes('/api/v1/courses?'));
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await refreshed;
      expect(requests.length).toBeGreaterThan(initialRequests);
      await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
      const wide = page.getByRole('button', { name: 'Compact workspace', exact: true });
      await wide.waitFor();
      await page.screenshot({ path: '/tmp/gradient-workspace-wide.png' });
      await wide.click();
      await page.getByRole('button', { name: 'Minimize GRADIENT', exact: true }).click();
      await page.getByRole('button', { name: 'Open GRADIENT', exact: true }).click();
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      await page.setViewportSize({ width: 375, height: 812 });
      const bounds = await page.getByRole('tab', { name: 'Academics', exact: true }).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
      const overflow = await page.locator('#gradient-workspace .g-body').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    } finally { await page.close(); }
  }, 20000);

  it('uses local calendar days and keeps hidden graded work out of To do', async () => {
    const { page } = await mockCanvas(browser, {
      fixedTime: '2026-11-02T15:00:00Z',
      configureData(courses) {
        const course = courses[0]!;
        const dueToday = course.assignments.find((assignment: any) => assignment.id === 1004);
        dueToday.name = 'Due later today';
        dueToday.due_at = '2026-11-02T23:59:00Z';
        Object.assign(course.submissions.find((submission: any) => submission.assignment_id === 1004), { excused: false, workflow_state: 'unsubmitted', score: null });
        const hidden = course.assignments.find((assignment: any) => assignment.id === 1008);
        hidden.name = 'Hidden instructor score';
        Object.assign(course.submissions.find((submission: any) => submission.assignment_id === 1008), {
          score: null, workflow_state: 'graded', posted_at: null,
        });
      },
    });
    try {
      await waitForLoaded(page);
      await tab(page, 'Coursework');
      const todayRow = page.locator('.g-task').filter({ has: page.locator('.g-task-meta') }).filter({ hasText: 'Due later today' });
      expect(await todayRow.innerText()).toContain('Due today');
      expect(await todayRow.innerText()).not.toContain('Tomorrow');
      expect(await page.locator('.g-task').filter({ hasText: 'Hidden instructor score' }).count()).toBe(0);
      await page.getByRole('button', { name: 'Graded', exact: true }).click();
      const hiddenRow = page.locator('.g-task').filter({ hasText: 'Hidden instructor score' });
      expect(await hiddenRow.innerText()).toContain('Graded · score hidden');
    } finally { await page.close(); }
  }, 20000);

  it('restores a minimized workspace from the extension toolbar event', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.getByRole('button', { name: 'Minimize GRADIENT', exact: true }).click();
      await page.getByRole('button', { name: 'Open GRADIENT', exact: true }).waitFor();
      expect(await page.locator('#gradient-workspace').isVisible()).toBe(false);
      await page.evaluate(() => window.dispatchEvent(new Event('gradient:toggle')));
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Open GRADIENT', exact: true }).count()).toBe(0);
    } finally { await page.close(); }
  }, 20000);

  it('clears previous course data while a refreshed session is pending', async () => {
    const { page } = await mockCanvas(browser);
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requestStarted: () => void = () => {};
    const started = new Promise<void>(resolve => { requestStarted = resolve; });
    try {
      await waitForLoaded(page);
      await page.route('**/api/v1/users/self/profile', async route => {
        requestStarted();
        await gate;
        await route.fulfill({ json: { id: 9991, name: 'Jordan Lee', short_name: 'Jordan' } });
      });
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await started;
      await page.getByText('Connecting your courses, deadlines, and materials.', { exact: true }).waitFor();
      expect(await page.locator('.g-course').count()).toBe(0);
      expect(await page.locator('#gradient-workspace').innerText()).not.toContain('Live Systems Lab');
      release();
      await waitForLoaded(page);
    } finally { release(); await page.close(); }
  }, 20000);

  it('renders the selected assignment’s published rubric and real instructor comments', async () => {
    const { page } = await mockCanvas(browser, {
      configureData(courses) {
        const submission = courses[0]!.submissions.find((item: any) => item.assignment_id === 1001);
        submission.rubric_assessment = { crit_rubric_4_0: { points: 35, rating_id: 'rat_rubric_4_0_1', comments: 'Show each step of your derivation.' } };
        submission.submission_comments = [{ author_name: 'Professor Rivera', comment: 'Please justify the asymptotic bound.', created_at: '2026-11-01T12:00:00Z' }];
      },
    });
    try {
      await waitForLoaded(page);
      await tab(page, 'Coursework');
      await page.getByLabel('Assignment to simulate').selectOption('1001');
      const feedback = page.getByRole('region', { name: 'Assignment rubric and instructor feedback', exact: true });
      await feedback.locator('summary').first().click();
      expect(await feedback.innerText()).toContain('Asymptotic Correctness');
      expect(await feedback.innerText()).toContain('Instructor assessment: 35 / 50 pts');
      expect(await feedback.innerText()).toContain('Show each step of your derivation.');
      expect(await feedback.innerText()).toContain('Professor Rivera');
      expect(await feedback.innerText()).toContain('Please justify the asymptotic bound.');
      await feedback.getByText('Rating descriptions', { exact: true }).first().click();
      expect(await feedback.innerText()).toContain('Full Marks: Rigorous Big-O derivation');
    } finally { await page.close(); }
  }, 20000);


  it('opens Coursework with the exact assignment from the active Canvas tab', async () => {
    const { page } = await mockCanvas(browser, { url: 'https://canvas.instructure.com/courses/99001/assignments/1008' });
    try {
      await page.getByLabel('Assignment to simulate').waitFor({ timeout: 15000 });
      expect(await page.getByRole('button', { name: 'Coursework', exact: true }).getAttribute('aria-pressed')).toBe('true');
      expect(await page.getByLabel('Choose a course').inputValue()).toBe('99001');
      expect(await page.getByLabel('Assignment to simulate').inputValue()).toBe('1008');
    } finally { await page.close(); }
  }, 20000);

});
