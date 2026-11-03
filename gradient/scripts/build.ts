/**
 * GRADIENT Extension Build Script (esbuild)
 * Bundles TypeScript sources into an unpacked Chrome Manifest V3 extension in dist/
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildExtension() {
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const extDistDir = path.join(distDir, 'extension');
  const optionsDistDir = path.join(extDistDir, 'options');

  // Create clean directory tree
  fs.mkdirSync(optionsDistDir, { recursive: true });

  console.log('==> Bundling Chrome MV3 Extension...');

  // 1. Content Script Bundle
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'extension/content.ts')],
    bundle: true,
    outfile: path.join(extDistDir, 'content.js'),
    format: 'iife',
    target: 'chrome110',
    sourcemap: false,
    minify: false,
    jsx: 'automatic',
    jsxImportSource: 'preact',
  });
  console.log('  ✓ Bundled extension/content.js');

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'extension/background.ts')],
    bundle: true, outfile: path.join(extDistDir, 'background.js'),
    format: 'esm', target: 'chrome110',
  });
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'extension/previewContent.tsx')],
    bundle: true, outfile: path.join(extDistDir, 'preview.js'),
    format: 'iife', target: 'chrome110', jsx: 'automatic', jsxImportSource: 'preact',
  });
  // 2. Options Script Bundle
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'extension/options/options.ts')],
    bundle: true,
    outfile: path.join(optionsDistDir, 'options.js'),
    format: 'iife',
    target: 'chrome110',
    sourcemap: false,
    minify: false,
    jsx: 'automatic',
    jsxImportSource: 'preact',
  });
  console.log('  ✓ Bundled extension/options/options.js');

  fs.cpSync(path.join(rootDir, 'extension/icons'), path.join(extDistDir, 'icons'), { recursive: true });
  fs.cpSync(path.join(rootDir, 'extension/licenses'), path.join(extDistDir, 'licenses'), { recursive: true });

  // 3. Copy Manifest V3 JSON
  fs.copyFileSync(
    path.join(rootDir, 'extension/manifest.json'),
    path.join(distDir, 'manifest.json')
  );
  console.log('  ✓ Copied manifest.json');

  // 4. Copy Options HTML
  fs.copyFileSync(
    path.join(rootDir, 'extension/options/options.html'),
    path.join(optionsDistDir, 'options.html')
  );
  console.log('  ✓ Copied options.html');

  console.log(`\n[BUILD COMPLETE] Unpacked extension ready at ${distDir}`);
}

buildExtension().catch((err) => {
  console.error('[BUILD FAILED]', err);
  process.exit(1);
});
