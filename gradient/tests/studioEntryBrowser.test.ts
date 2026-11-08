import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser, mockCanvas } from './browserHarness.js';

describe('Each Studio tool starts directly from its own screen', () => {
 let browser: Browser;
 beforeAll(async () => { browser = await launchBrowser(); });
 afterAll(async () => { await browser?.close(); });
 it.each([
  ['Flashcards', 'Create flashcards', 'Reveal answer'],
  ['Practice', 'Create practice questions', 'Smaller instances'],
  ['Concept map', 'Create concept map', 'Recursion'],
  ['Listen', 'Create audio lesson', 'Play chapter'],
  ['Guided reading', 'Open selected material', 'Next passage'],
 ])('%s imports and opens material without visiting Sources', async (tool, action, result) => {
  const { page } = await mockCanvas(browser, { legacy: true });
  page.setDefaultTimeout(6000);
  const passage = 'Recursion solves problems by reducing them to smaller instances. A base case stops the recursion.';
  let jobs = 0;
  let request: any;
  let speechJob = false;
  await page.route('**/api/v1/courses/*/pages/signals-study-guide', route => route.fulfill({ json: { body: `<p>${passage}</p>` } }));
  await page.route('**/api/v1/assistant/**', route => {
   const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
   if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
   const path = new URL(route.request().url()).pathname;
   if (path.endsWith('/health')) return route.fulfill({ headers, json: { ok: true, studioVersion: 1, ollamaConnected: true, models: ['gpt-oss:20b'] } });
   if (path.endsWith('/jobs')) { const payload = route.request().postDataJSON(); speechJob = payload.type === 'speech'; jobs++; request = payload.request; return route.fulfill({ headers, json: { id: 'tool-entry' } }); }
   if (speechJob) {
    const wav = Buffer.alloc(48044); wav.write('RIFF'); wav.writeUInt32LE(48036,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(48000,40);
    return route.fulfill({headers,json:{status:'complete',result:{data:wav.toString('base64'),mimeType:'audio/wav',duration:1}}});
   }
   const deck = { title: 'Recursion study set', cards: Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, question: `How does recursion work ${i}?`, answer: 'Smaller instances', options: ['Smaller instances', 'Randomness', 'Larger problems', 'No base case'], explanation: 'Reduce the problem.', topic: 'Recursion', sourceId: 'S1', quote: passage })), concepts: [{ id: 'n1', label: 'Recursion', explanation: 'Smaller subproblems.', parentId: null, sourceId: 'S1', quote: passage }] };
   return route.fulfill({ headers, json: { status: 'complete', result: { title: 'Study set', summary: 'Ready', markdown: JSON.stringify(deck), sampleMarkdown: '', sources: [], diagrams: [], graphs: [], images: [], warnings: [] } } });
  });
  try {
   await page.getByRole('button', { name: /^Study studio/ }).click();
   await page.getByRole('button', { name: tool, exact: true }).click();
   expect(await page.getByRole('button', { name: tool, exact: true }).getAttribute('aria-pressed')).toBe('true');
   const setup = page.getByRole('region', { name: 'Tool materials' });
   await setup.getByRole('checkbox', { name: 'Use Signals study guide', exact: true }).check();
   await setup.getByRole('button', { name: action, exact: true }).click();
   if (tool === 'Concept map') await page.locator('.ss-node').filter({ hasText: result }).waitFor();
   else await page.getByRole('button', { name: result, exact: true }).waitFor();
   expect(await page.getByRole('button', { name: tool, exact: true }).getAttribute('aria-pressed')).toBe('true');
   expect(jobs).toBe(tool === 'Guided reading' ? 0 : 1);
   if (tool !== 'Guided reading') expect(request.studio).toBe(true);
   else expect(await page.locator('.ss-passage').innerText()).toContain('Recursion solves problems');
   if (tool === 'Listen') {
    await page.getByRole('button', {name:'Play chapter',exact:true}).click();
    await page.getByLabel('Generated narration', {exact:true}).waitFor();
    expect(request.voice).toBe('af_heart');
    expect(request.text).toContain('Recursion');
    await page.getByRole('link', {name:'Download audio',exact:true}).waitFor();
    await page.getByRole('button', {name:'Stop',exact:true}).click();
    expect(await page.getByLabel('Generated narration', {exact:true}).count()).toBe(0);
   }
   if (tool === 'Flashcards') {
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await page.getByRole('button', { name: 'Got it', exact: true }).waitFor();
   }
   await page.screenshot({ path: `/tmp/gradient-studio-${tool.replace(/ /g, '-').toLowerCase()}.png` });
  } finally { await page.close(); }
 }, 15000);
});
