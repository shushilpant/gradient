import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import type { Browser } from 'playwright';
import { launchBrowser } from './browserHarness.js';

const origin = 'https://usm.instructure.com';
let browser: Browser;
const script = buildSync({ entryPoints: ['extension/canvasMirrorAssignments.ts'], bundle: true, format: 'iife', globalName: 'AssignmentCapture', write: false }).outputFiles[0]!.text;
beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser?.close(); });

async function capture(options: { html: string; resources?: any[]; restricted?: boolean; text?: string }) {
  const page = await browser.newPage();
  try {
    await page.route(origin + '/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Canvas</p>' }));
    await page.goto(origin + '/courses/2');
    await page.addScriptTag({ content: script });
    return await page.evaluate(async ({ origin, options }) => {
      const calls: string[] = [];
      const extractFiles: any[] = [];
      (window as any).fetch = async (url: string) => {
        calls.push(String(url));
        if (String(url).includes('/api/v1/files/')) return new Response(JSON.stringify({ display_name: 'Homework.pdf', 'content-type': 'application/pdf', url: origin + '/files/5/download', locked_for_user: options.restricted }));
        return new Response('pdf-content', { headers: { 'Content-Type': 'application/pdf' } });
      };
      const source = {
        origin, mirrorWarnings: [], courses: [{ id: '2', resources: options.resources ?? [], assignments: [{ id: '3', name: 'Homework 5', descriptionHtml: options.html }] }],
      };
      const output = await (window as any).AssignmentCapture.hydrateCanvasMirrorAssignments(source, async (file: any) => {
        extractFiles.push(file);
        return { text: options.text ?? '1. Calculate the inverse Laplace transform F(s) = 1/(s + 2).\n2. Explain <decay> & show every step.', warnings: [] };
      });
      return { output, source, calls, extractFiles };
    }, { origin, options });
  } finally { await page.close(); }
}

it('embeds extracted assignment PDF questions in staged descriptions without changing the live snapshot or copying raw bytes', async () => {
  const html = '<p>Read <a href="/courses/2/files/5?wrap=1">Homework.pdf</a> and <a href="/files/5/download">the same PDF</a>.</p>';
  const { output, source, calls, extractFiles } = await capture({ html });
  expect(calls).toEqual([origin + '/api/v1/files/5', origin + '/files/5/download']);
  const staged = output.courses[0].assignments[0].descriptionHtml;
  expect(staged).toContain(html);
  expect(staged).toContain('data-offcanvas-assignment-source=');
  expect(staged).toContain('data-offcanvas-source-complete="true"');
  expect(staged).toContain('Calculate the inverse Laplace transform');
  expect(staged).toContain('&lt;decay&gt; &amp; show every step.');
  expect(source.courses[0]!.assignments[0]!.descriptionHtml).toBe(html);
  expect(extractFiles).toHaveLength(1);
  expect(JSON.stringify(output)).not.toContain(extractFiles[0].data);
  expect(output.mirrorWarnings).toEqual([]);
});

it('finds filename-only PDFs in the discovered course files rather than copying unrelated files', async () => {
  const { output, calls } = await capture({ html: '<p>Read Homework.pdf before class.</p>', resources: [
    { title: 'Unrelated.pdf', url: origin + '/courses/2/files/99', type: 'file' },
    { title: 'Homework.pdf', url: origin + '/courses/2/files/5', type: 'file' },
  ] });
  expect(calls[0]).toBe(origin + '/api/v1/files/5');
  expect(calls).toHaveLength(2);
  expect(output.courses[0].assignments[0].descriptionHtml).toContain('Calculate the inverse Laplace transform');
});

it('leaves unreadable or external attachments as references and reports the missing instruction text', async () => {
  const html = '<a href="/courses/2/files/5">Homework.pdf</a><a href="https://outside.example/files/8">External.pdf</a>';
  const { output, calls, extractFiles } = await capture({ html, restricted: true });
  expect(calls).toEqual([origin + '/api/v1/files/5']);
  expect(extractFiles).toEqual([]);
  expect(output.courses[0].assignments[0].descriptionHtml).toBe(html);
  expect(output.mirrorWarnings.some((warning: string) => warning.includes('no readable instruction text'))).toBe(true);
});

it('bounds escaped staged descriptions and reports shortened document text', async () => {
  const html = '<a href="/courses/2/files/5">Homework.pdf</a>';
  const { output } = await capture({ html, text: '<&>'.repeat(7000) });
  expect(output.courses[0].assignments[0].descriptionHtml.length).toBeLessThanOrEqual(48000);
  expect(output.mirrorWarnings.some((warning: string) => warning.includes('shortened'))).toBe(true);
  expect(output.courses[0].assignments[0].descriptionHtml).toContain('data-offcanvas-source-complete="false"');
});


it('retains PDF questions beyond the shared reader excerpt limit when the staged description has room', async () => {
  const ending = 'FINAL QUESTION: prove the inverse transform.';
  const { output } = await capture({ html: '<a href="/courses/2/files/5">Homework.pdf</a>', text: 'Background. '.repeat(2500) + ending });
  expect(output.courses[0].assignments[0].descriptionHtml).toContain(ending);
  expect(output.courses[0].assignments[0].descriptionHtml).toContain('data-offcanvas-source-complete="true"');
});
