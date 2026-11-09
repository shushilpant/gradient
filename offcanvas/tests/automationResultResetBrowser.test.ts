import { buildSync } from 'esbuild';
import { expect, it } from 'vitest';
import { launchBrowser } from './browserHarness.js';

const driver = () => buildSync({
  stdin: {
    contents: `
      import { render } from 'preact';
      import { AutoWorkflow } from './extension/ui/WorkflowMode.tsx';
      import { beginPageAutomation, finishPageAutomation, resumePageAutomation, clearPageAutomationResult, getPageAutomation } from './extension/pageAutomation.ts';
      const packet = {
        title: 'Previous Panic homework result', summary: 'Saved Panic result.', markdown: 'Old derivation.',
        sources: [], diagrams: [], graphs: [], images: [], warnings: []
      };
      Object.assign(window, {
        async seedCompletedPanic() {
          beginPageAutomation('demo', {}, 'Panic replay');
          await resumePageAutomation('demo', async run => finishPageAutomation(run, packet, 'Panic complete'));
        },
        mountWorkflow() { render(<AutoWorkflow/>, document.getElementById('workspace')); },
        beginNextDemo() { beginPageAutomation('demo', {}, 'New dedicated demo'); },
        clearResult: clearPageAutomationResult,
        session: getPageAutomation,
      });
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', jsxImportSource: 'preact',
}).outputFiles![0]!.text;

it('clears a completed Panic answer when the dedicated demo is requested, including setup failures', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8080/')
      ? route.fulfill({ contentType: 'text/html', body: '<main id="workspace"></main>' }) : route.abort());
    await page.goto('http://127.0.0.1:8080/courses/1');
    await page.evaluate(driver());
    await page.evaluate(async () => {
      await (window as any).seedCompletedPanic();
      (window as any).mountWorkflow();
    });
    const oldAnswer = page.getByRole('heading', { name: 'Previous Panic homework result', exact: true });
    await oldAnswer.waitFor();
    await page.getByRole('button', { name: 'Demo automation', exact: true }).click();
    await page.getByRole('alert').waitFor();
    expect(await oldAnswer.count()).toBe(0);
    expect(await page.getByRole('region', { name: 'Automatic reference sample', exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => (window as any).session())).toBeNull();
    expect(await page.locator('#offcanvas-page-control').count()).toBe(0);

    await page.evaluate(async () => {
      await (window as any).seedCompletedPanic();
      (window as any).beginNextDemo();
      (window as any).clearResult();
    });
    expect(await oldAnswer.count()).toBe(0);
    expect(await page.evaluate(() => (window as any).session())).toMatchObject({ status: 'running', label: 'New dedicated demo' });
    expect(await page.evaluate(() => (window as any).session().packet)).toBeUndefined();
  } finally { await browser.close(); }
}, 20000);
