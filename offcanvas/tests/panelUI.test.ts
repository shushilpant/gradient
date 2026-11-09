import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

describe('OffCanvas Canvas workspace', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  async function tab(page: Page, name: string): Promise<void> {
    await page.getByRole('tab', { name: 'Academics', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    expect(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')).toBe('true');
  }

  it('supports course navigation, real coursework search, and what-if simulation', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.screenshot({ path: '/tmp/offcanvas-workspace-compact.png' });
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
      await page.waitForFunction(() => document.getElementById('offcanvas-panel-host')?.shadowRoot?.querySelector<HTMLInputElement>('[aria-label=\"What-if score percentage\"]')?.value === '20');
      const lowResult = await page.locator('.g-whatif-result').innerText();
      await slider.evaluate((element) => { const input = element as HTMLInputElement; input.value = '95'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.getElementById('offcanvas-panel-host')?.shadowRoot?.querySelector<HTMLInputElement>('[aria-label=\"What-if score percentage\"]')?.value === '95');
      expect(await page.locator('.g-whatif-result').innerText()).not.toBe(lowResult);
      await page.getByLabel('Choose a course').selectOption('99002');
      expect(await page.getByLabel('Choose a course').inputValue()).toBe('99002');
    } finally { await page.close(); }
  }, 20000);

  it('offers only Overview, Coursework, and Grade Lab in Academics', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      expect(await page.locator('.g-wordmark').innerText()).toBe('OffCanvas');
      const views = page.getByRole('group', { name: 'Academic views', exact: true });
      expect(await views.getByRole('button').allTextContents()).toEqual(['Overview', 'Coursework', 'Grade Lab']);
    } finally { await page.close(); }
  }, 20000);

  it('ranks assignments by course grade impact and surfaces urgent work through the Panic button', async () => {
    const { page } = await mockCanvas(browser, {
      fixedTime: '2026-11-02T15:00:00Z',
      configureData(courses) {
        const [course, ...otherCourses] = courses;
        const mainCourse = course!;
        mainCourse.course.apply_assignment_group_weights = true;
        mainCourse.assignment_groups = [
          { id: 101, name: 'Practice', group_weight: 20 },
          { id: 102, name: 'Projects', group_weight: 30 },
          { id: 103, name: 'Portfolio', group_weight: 50 },
        ];
        mainCourse.assignments = [
          [1001, 'Portfolio review', 103, 50, '2026-11-04T16:00:00Z'],
          [1002, 'Urgent project', 102, 100, '2026-11-02T16:30:00Z'],
          [1003, 'Urgent practice', 101, 100, '2026-11-02T15:30:00Z'],
          [1004, 'Evening project', 102, 100, '2026-11-03T03:00:00Z'],
          [1005, 'Already handed in', 101, 100, '2026-11-02T15:15:00Z'],
          [1006, 'Overdue practice', 101, 100, '2026-11-02T14:30:00Z'],
          [1007, 'Marked practice', 101, 100, null],
          [1008, 'Marked project', 102, 100, null],
        ].map(([id, name, assignment_group_id, points_possible, due_at]) => ({
          id, name, assignment_group_id, points_possible, due_at, submission_types: ['online_upload'],
        }));
        mainCourse.submissions = [
          { assignment_id: 1005, workflow_state: 'submitted', score: null },
          { assignment_id: 1007, workflow_state: 'graded', score: 75, posted_at: '2026-11-01T15:00:00Z' },
          { assignment_id: 1008, workflow_state: 'graded', score: 75, posted_at: '2026-11-01T15:00:00Z' },
        ];
        for (const item of otherCourses) {
          item.assignments = [];
          item.submissions = [];
        }
      },
    });
    try {
      await waitForLoaded(page);
      const top = page.getByRole('region', { name: 'Top grade priority', exact: true });
      expect(await top.innerText()).toContain('Portfolio review');
      expect(await top.innerText()).toMatch(/50(?:\.0)?%/);
      expect(await top.getByRole('link', { name: 'Open in Canvas' }).getAttribute('href')).toContain('/assignments/1001');
      const priorities = page.getByRole('region', { name: 'Assignment priorities', exact: true });
      const pendingTitles = /Urgent project|Urgent practice|Evening project|Portfolio review/g;
      const priorityText = await priorities.innerText();
      expect(priorityText.match(pendingTitles)).toEqual(['Urgent project', 'Evening project', 'Urgent practice']);
      expect(priorityText).not.toMatch(/Already handed in|Overdue practice/);

      await priorities.getByRole('button', { name: 'Panic button', exact: true }).click();
      const panic = page.getByRole('region', { name: 'Deadline priorities', exact: true });
      const panicText = await panic.innerText();
      expect(panicText.match(pendingTitles)).toEqual(['Urgent project', 'Urgent practice', 'Evening project', 'Portfolio review']);
      expect(panicText).toContain('1h 30m left');
      expect(panicText).toMatch(/10(?:\.0)?%/);
      expect(panicText).toMatch(/5(?:\.0)?%/);
      expect(panicText).not.toContain('Already handed in');
      expect(panicText).not.toContain('Overdue practice');
      expect(await panic.getByRole('link', { name: 'Start Urgent project in Canvas' }).getAttribute('href')).toContain('/assignments/1002');
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.locator('.g-body').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

      await panic.getByRole('button', { name: /Urgent project/ }).click();
      expect(await page.getByRole('button', { name: 'Coursework', exact: true }).getAttribute('aria-pressed')).toBe('true');
      expect(await page.getByLabel('Assignment to simulate').inputValue()).toBe('1002');
      expect(await page.locator('.g-list .g-task strong button').allTextContents()).toEqual([
        'Portfolio review', 'Urgent project', 'Evening project', 'Urgent practice', 'Overdue practice',
      ]);
      const deadlines = page.getByRole('region', { name: 'Deadline tracking and calendar', exact: true });
      await deadlines.getByRole('button', { name: 'Panic button', exact: true }).click();
      await panic.waitFor();
    } finally { await page.close(); }
  }, 20000);

  it('shows Canvas server failures in the academic overview', async () => {
    const { page } = await mockCanvas(browser, { filesServerError: true });
    try {
      await waitForLoaded(page);
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
      expect(file.suggestedFilename()).toBe('offcanvas-canvas-deadlines.ics');
      const downloadedPath = await file.path();
      expect(downloadedPath).not.toBeNull();
      const contents = readFileSync(downloadedPath!, 'utf8');
      expect(contents).toContain('BEGIN:VCALENDAR');
      expect(contents).toContain('END:VCALENDAR');
      expect(contents).toContain('BEGIN:VEVENT');
      expect(contents).toContain('UID:offcanvas-');
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
      await page.screenshot({ path: '/tmp/offcanvas-workspace-wide.png' });
      await wide.click();
      await page.getByRole('button', { name: 'Minimise OffCanvas', exact: true }).click();
      await page.getByRole('button', { name: 'Open OffCanvas', exact: true }).click();
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      await page.setViewportSize({ width: 375, height: 812 });
      const bounds = await page.getByRole('tab', { name: 'Academics', exact: true }).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
      const overflow = await page.locator('#offcanvas-workspace .g-body').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
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
      await page.getByRole('button', { name: 'Marked', exact: true }).click();
      const hiddenRow = page.locator('.g-task').filter({ hasText: 'Hidden instructor score' });
      expect(await hiddenRow.innerText()).toContain('Marked · score hidden');
    } finally { await page.close(); }
  }, 20000);

  it('restores a minimized workspace from the extension toolbar event', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await page.getByRole('button', { name: 'Minimise OffCanvas', exact: true }).click();
      await page.getByRole('button', { name: 'Open OffCanvas', exact: true }).waitFor();
      expect(await page.locator('#offcanvas-workspace').isVisible()).toBe(false);
      await page.evaluate(() => window.dispatchEvent(new Event('offcanvas:toggle')));
      await page.getByRole('tab', { name: 'Academics', exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Open OffCanvas', exact: true }).count()).toBe(0);
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
      expect(await page.locator('#offcanvas-workspace').innerText()).not.toContain('Live Systems Lab');
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
      const feedback = page.getByRole('region', { name: 'Marking criteria and lecturer feedback', exact: true });
      await feedback.locator('summary').first().click();
      expect(await feedback.innerText()).toContain('Asymptotic Correctness');
      expect(await feedback.innerText()).toContain('Your lecturer gave 35 / 50 pts');
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
