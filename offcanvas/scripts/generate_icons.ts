/** Regenerate extension icons from the shared OffCanvas vector mark. */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const icons = new URL('../extension/icons/', import.meta.url);
const source = readFileSync(new URL('mark.svg', icons), 'utf8');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${source}`);
    await page.screenshot({ path: fileURLToPath(new URL(`icon${size}.png`, icons)), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
