import { expect, it } from 'vitest';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

it('shows every allocation in the eight-hour demo and reconciles the total', async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await mockCanvas(browser, {
      fixedTime: '2026-11-09T12:00:00Z',
      configureData(courses) {
        for (const course of courses) {
          for (const assignment of course.assignments) assignment.due_at = '2026-11-12T23:59:00Z';
          course.submissions = [];
        }
      },
    });
    await waitForLoaded(page);
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Academics', exact: true }).click();
    const split = page.getByRole('region', { name: 'Suggested study split', exact: true });
    await split.waitFor({ timeout: 15000 });
    const rows = await split.locator('.g-demo-row').evaluateAll(elements => elements.map(element => ({
      name: element.querySelector('strong')?.textContent ?? '',
      hours: parseFloat(element.querySelector('.g-due')?.textContent ?? ''),
      reason: element.querySelector('small')?.textContent ?? '',
    })));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const exam = rows.find(row => row.name === 'Lecture Exam 1');
    const quiz = rows.find(row => row.name === 'Quiz 1: Biomolecules');
    expect(exam?.hours).toBeGreaterThan(quiz?.hours ?? 0);
    expect(exam?.reason).toContain('Full credit adds 45 percentage points to the final grade');
    expect(quiz?.reason).toContain('Full credit adds 10 percentage points to the final grade');
    expect(Math.max(...rows.map(row => row.hours))).toBeGreaterThan(Math.min(...rows.map(row => row.hours)));
    const allocated = rows.reduce((sum, row) => sum + row.hours, 0);
    expect(allocated).toBe(8);
    expect(await split.getByRole('status').innerText()).toBe('8.0 of 8.0 hours allocated · 0.0 hours unallocated.');
    const widths = await split.locator('.g-mini-bar i').evaluateAll(bars => bars.map(bar => parseFloat((bar as HTMLElement).style.width)));
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(100);
  } finally { await browser.close(); }
}, 25000);
