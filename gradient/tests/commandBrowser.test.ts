import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser, mockCanvas, bundle } from './browserHarness.js';

async function openCommand(page: Page) {
  page.setDefaultTimeout(4000);
  await page.getByRole('button', { name: /Command center/ }).click();
  await page.getByRole('heading', { name: 'What’s the mission?' }).waitFor();
  await page.getByText('Ready for your next move', { exact: false }).waitFor();
}
async function command(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Your command', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Run command', exact: false }).click();
}
async function mockAssistant(page: Page, pending = false) {
  const bodies: any[] = [];
  await page.route('**/api/v1/assistant/**', async route => {
    const url = new URL(route.request().url());
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/health')) return route.fulfill({ headers, json: { ok: true, ollamaConnected: true, models: ['gpt-oss:20b'] } });
    if (url.pathname.endsWith('/jobs')) { bodies.push(route.request().postDataJSON()); return route.fulfill({ headers, json: { id: 'mission-test' } }); }
    return route.fulfill({ headers, json: pending ? { status: 'running', stage: 'drafting', label: 'Building your practice questions' } : { status: 'complete', result: { title: 'Your revision session', summary: 'Practice based on accessible course material.', markdown: '## Diagnostic\n\n1. Explain the main concept in your own words.\n2. Compare two approaches.\n3. Give an example.', sampleMarkdown: '', sources: [], diagrams: [], graphs: [], images: [], warnings: [] } } });
  });
  return bodies;
}

describe('Command center browser integration', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('opens without choosing a mode, briefs real Canvas data, finds sources, and remembers notes across reload', async () => {
    const { page, requests } = await mockCanvas(browser, { workflowMode: null, fixedTime: '2026-11-05T15:00:00Z' });
    try {
      await openCommand(page);
      await command(page, 'Brief me for today');
      await page.getByRole('log').getByText(/Hello Jordan/).waitFor();
      await command(page, 'Find signals');
      await page.getByRole('log').getByRole('link', { name: /Signals study guide/ }).first().waitFor();
      await command(page, 'Remember I prefer visual explanations');
      await page.getByRole('log').getByText(/Remembered on this device/).waitFor();
      await page.locator('.jc-notes summary').click();
      expect(await page.getByRole('textbox', { name: 'Edit saved academic memory' }).inputValue()).toBe('I prefer visual explanations');
      await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('gradient_command_v1:') && localStorage.getItem(key)?.includes('I prefer visual explanations')));
      await page.reload(); await page.evaluate(bundle()); await openCommand(page);
      await page.locator('.jc-notes summary').click();
      expect(await page.getByRole('textbox', { name: 'Edit saved academic memory' }).inputValue()).toBe('I prefer visual explanations');
      await page.getByRole('button', { name: 'Forget all notes', exact: true }).click();
      expect(await page.getByRole('textbox', { name: 'Edit saved academic memory' }).count()).toBe(0);
      expect(requests.every(request => request.method === 'GET')).toBe(true);
    } finally { await page.close(); }
  }, 25000);

  it('executes a revision workflow and sends the requested time budget to the model', async () => {
    const { page } = await mockCanvas(browser, { fixedTime: '2026-11-05T15:00:00Z' });
    try {
      const bodies = await mockAssistant(page);
      await openCommand(page);
      await command(page, 'Prepare me for my next deadline in 40 minutes');
      await page.getByRole('heading', { name: 'Your revision session' }).waitFor({ timeout: 12000 });
      expect(bodies[0]?.request.prompt).toContain('fits 40 minutes');
      expect(bodies[0]?.request.mode).toBe('explain');
      expect(bodies[0]?.request.webResearch).toBe(false);
      expect(await page.locator('.jc-steps li[data-state=done]').count()).toBe(4);
      expect(await page.locator('.jc-block').count()).toBeGreaterThan(0);
      await page.screenshot({ path: '/tmp/gradient-command-center.png' });
    } finally { await page.close(); }
  }, 20000);

  it('interrupts inference, replans without losing completed work, and starts a pausable focus timer', async () => {
    const { page } = await mockCanvas(browser, { fixedTime: '2026-11-05T15:00:00Z' });
    try {
      await mockAssistant(page, true);
      await openCommand(page);
      await command(page, 'Prepare me for my next deadline');
      await page.getByRole('button', { name: 'Interrupt', exact: true }).waitFor();
      await page.getByRole('checkbox', { name: /Complete / }).first().check();
      await command(page, 'Actually I only have 40 minutes');
      await page.getByRole('log').getByText(/Adjusted to 40 minutes/).waitFor();
      expect(await page.locator('.jc-block.done').count()).toBe(1);
      expect(await page.getByRole('button', { name: 'Interrupt', exact: true }).count()).toBe(0);
      await command(page, 'I have 25 minutes. Get me started');
      await page.getByRole('timer').waitFor();
      expect(await page.getByRole('timer').innerText()).toBe('25:00');
      await page.getByRole('button', { name: 'Minimize GRADIENT', exact: true }).click();
      await page.getByRole('button', { name: 'Open GRADIENT', exact: true }).click();
      expect(await page.getByRole('timer').innerText()).toBe('25:00');
      expect(await page.getByRole('log').innerText()).toContain('Adjusted to 40 minutes');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('heading', { name: 'Focus paused' }).waitFor();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.getByRole('heading', { name: 'Focus in progress' }).waitFor();
      await page.getByRole('button', { name: 'Finish & reflect' }).click();
      await page.getByRole('button', { name: 'Check my explanation', exact: true }).waitFor();
    } finally { await page.close(); }
  }, 20000);

  it('detects changed instructions after refresh and preserves the active command workspace', async () => {
    let mutableCourses: Array<Record<string, any>> = [];
    const { page } = await mockCanvas(browser, { fixedTime: '2026-11-05T15:00:00Z', configureData: courses => { mutableCourses = courses; } });
    try {
      await openCommand(page);
      await command(page, 'Remember I learn by doing');
      await page.getByRole('log').getByText(/Remembered on this device/).waitFor();
      const assignment = mutableCourses[0]!.assignments[0];
      assignment.description = `${assignment.description || ''}<p>Include a new diagram of the architecture.</p>`;
      await page.getByRole('button', { name: 'Refresh Canvas', exact: true }).click();
      await page.getByRole('heading', { name: 'Changes to intercept' }).waitFor();
      expect(await page.locator('.jc-alert').first().innerText()).toContain('new diagram');
      expect(await page.getByRole('log').innerText()).toContain('I learn by doing');
      await page.locator('.jc-notes summary').click();
      expect(await page.getByRole('textbox', { name: 'Edit saved academic memory' }).inputValue()).toBe('I learn by doing');
    } finally { await page.close(); }
  }, 15000);

  it('takes a voice transcript and supports keyboard access', async () => {
    const { page } = await mockCanvas(browser, { workflowMode: null });
    try {
      page.setDefaultTimeout(4000);
      await page.evaluate(() => {
        (window as any).SpeechRecognition = class {
          onresult: any; onend: any;
          start() { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Brief me for today' } }] }); this.onend?.(); }
          stop() { this.onend?.(); } abort() { this.onend?.(); }
        };
      });
      await page.keyboard.press('Control+Shift+Space');
      await page.getByRole('heading', { name: 'What’s the mission?' }).waitFor();
      await page.getByRole('button', { name: 'Use voice', exact: true }).click();
      expect(await page.getByRole('textbox', { name: 'Your command', exact: true }).inputValue()).toBe('Brief me for today');
      await page.getByRole('button', { name: 'Run command', exact: false }).click();
      await page.getByRole('log').getByText(/Hello Jordan/).waitFor();
    } finally { await page.close(); }
  }, 15000);
});
