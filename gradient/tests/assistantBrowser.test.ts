import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { launchBrowser, mockCanvas, waitForLoaded } from './browserHarness.js';

const packet = {
  title: 'A sourced systems study packet', summary: 'A complete reference for your assignment.',
  markdown: '## How it works\n\nUnderstand the process [S1].\n\n<script>window.injected=true</script>\n\n[Unsafe](javascript:alert(1))',
  sampleMarkdown: '## Sample assignment for review\n\nA worked reference answer, with a disclosed AI contribution.',
  sources: [{ id: 'S1', title: 'Verified course guide', url: 'https://canvas.instructure.com/courses/99001/pages/signals-study-guide', kind: 'canvas' }],
  diagrams: [{ title: 'Branching process', nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Left' }, { id: 'c', label: 'Right' }], edges: [{ from: 'a', to: 'b', label: 'Path one' }, { from: 'a', to: 'c', label: 'Path two' }] }],
  graphs: [{ title: 'Illustrative comparison', xLabel: 'Condition', yLabel: 'Value', points: [{ label: 'A', value: 10 }, { label: 'B', value: -4 }] }],
  images: [], warnings: ['Verify the sample against the rubric.'],
};

async function mockAssistant(page: Page, received: Record<string, any>[], failure = false) {
  await page.route('http://127.0.0.1:8765/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/health')) return route.fulfill({ headers, json: {
      ok: true, ollamaConnected: true, models: ['gpt-oss:20b', 'gemma4:31b', 'gemma4:e4b', 'remote-model:latest', 'llamacpp:raw-digest'],
      modelDetails: [
        { name: 'gpt-oss:20b', size: 13000000000, capabilities: ['completion', 'thinking'], parameterSize: '20.9B', quantization: 'MXFP4' },
        { name: 'gemma4:31b', size: 19000000000, capabilities: ['completion', 'vision', 'thinking'] },
        { name: 'gemma4:e4b', size: 6300000000, capabilities: ['completion', 'vision', 'thinking'] },
        { name: 'remote-model:latest', size: 500, capabilities: ['completion', 'vision'], remote: true },
        { name: 'llamacpp:raw-digest', size: 6300000000, capabilities: ['completion', 'vision'] },
      ], recommended: { reasoningModel: 'gpt-oss:20b', visionModel: 'gemma4:e4b', reason: 'Efficient local reasoning and a compact vision model.' }, pullStates: {},
    } });
    if (path.endsWith('/jobs') && request.method() === 'POST') {
      received.push(request.postDataJSON());
      return route.fulfill({ headers, json: { id: 'test-job', status: 'running' } });
    }
    if (path.endsWith('/jobs/test-job')) return route.fulfill({ headers, json: failure ? { status: 'error', error: 'Not enough memory for this model.' } : { status: 'complete', result: packet } });
    return route.fulfill({ headers, status: 404, json: { detail: 'Unsupported test endpoint' } });
  });
}

async function connect(page: Page) {
  page.setDefaultTimeout(5000);
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await page.getByText('Local AI ready', { exact: true }).waitFor();
}

describe('Local study assistant browser flow', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser?.close(); });

  it('builds a sample at the chosen depth, reads course pages, safely renders visuals, exports and retains it across tabs', async () => {
    const { page } = await mockCanvas(browser);
    const received: Record<string, any>[] = [];
    try {
      await waitForLoaded(page);
      await mockAssistant(page, received);
      await page.evaluate(() => localStorage.setItem('gradient_assistant_settings', JSON.stringify({ backendUrl: 'http://127.0.0.1:8765', reasoningModel: 'qwen3:8b', visionModel: 'qwen3-vl:8b', detailLevel: 'a_bit_more', webResearch: true })));
      await page.route('**/api/v1/courses/99001/pages/signals-study-guide', route => route.fulfill({ json: { body: '<p>A real retrieved explanation of signals.</p>', published: true } }));
      await connect(page);
      expect(await page.locator('#ja-reasoning-model').inputValue()).toBe('gpt-oss:20b');
      expect(await page.locator('#ja-vision-model').inputValue()).toBe('gemma4:e4b');
      const choices = await page.locator('#ja-reasoning-model option').allTextContents();
      expect(choices.join(' ')).not.toMatch(/remote-model|llamacpp/);
      await page.getByRole('button', { name: 'Go all in', exact: false }).click();
      await page.getByRole('button', { name: 'Sample assignment', exact: true }).click();
      await page.getByLabel('Anything you want me to focus on?').fill('Explain each step and include the diagram.');
      await page.getByRole('button', { name: 'Create my sample assignment' }).click();
      await page.getByRole('heading', { name: packet.title, exact: true }).waitFor({ timeout: 10000 });
      expect(received[0]?.type).toBe('generate');
      expect(received[0]?.request).toMatchObject({ level: 'all_in', mode: 'sample', model: 'gpt-oss:20b' });
      expect(received[0]?.request.resources.some((r: any) => r.text?.includes('real retrieved explanation'))).toBe(true);
      expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
      expect(await page.locator('.ja-result a[href^="javascript:"]').count()).toBe(0);
      expect(await page.getByRole('img', { name: 'Illustrative comparison' }).count()).toBe(1);
      expect(await page.locator('.ja-result').innerText()).toContain('Start → Right');
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export illustrated HTML' }).click();
      const download = await downloading;
      const file = await download.path();
      expect(download.suggestedFilename()).toMatch(/\.html$/);
      const html = readFileSync(file!, 'utf8');
      expect(html).toContain('<svg');
      expect(html).toContain('Verified course guide');
      expect(html).not.toContain('<script>window.injected=true</script>');
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
      await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
      expect(await page.getByRole('heading', { name: packet.title, exact: true }).isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Refresh Canvas data', exact: true }).click();
      await page.getByRole('heading', { name: packet.title, exact: true }).waitFor();
      expect(received).toHaveLength(1);
      await page.screenshot({ path: '/private/tmp/gradient-assistant.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      const workspace = await page.locator('#gradient-workspace').boundingBox();
      expect(workspace!.width).toBeLessThanOrEqual(390);
      expect(await page.locator('.ja').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    } finally { await page.close(); }
  }, 20000);

  it('shows model errors and allows a retry without fabricating a packet', async () => {
    const { page } = await mockCanvas(browser);
    try {
      await waitForLoaded(page);
      await mockAssistant(page, [], true);
      await connect(page);
      await page.getByRole('button', { name: 'Build my study packet', exact: true }).click();
      await page.getByText('Not enough memory for this model.', { exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Build my study packet', exact: true }).isEnabled()).toBe(true);
      expect(await page.getByRole('region', { name: 'Generated study packet' }).count()).toBe(0);
    } finally { await page.close(); }
  }, 20000);
});
