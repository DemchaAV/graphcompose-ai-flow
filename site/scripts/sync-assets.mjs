#!/usr/bin/env node
// Copies preview PNGs from the parent repo into site/public/previews/ so they
// are served as static assets at /previews/*. Runs before astro build.

import { mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const outDir = join(siteRoot, 'public', 'previews');

const assets = [
  // CV reference (input)
  ['examples/cv-reference/reference/reference-page-1.png', 'cv/reference-page-1.png'],
  ['examples/cv-reference/reference/reference-page-2.png', 'cv/reference-page-2.png'],
  // mint-editorial-cv published bundle (output)
  ['templates/mint-editorial-cv/preview/output-page-1.png', 'cv/output-page-1.png'],
  ['templates/mint-editorial-cv/preview/output-page-2.png', 'cv/output-page-2.png'],
  ['templates/mint-editorial-cv/preview/output-debug-page-1.png', 'cv/output-debug-page-1.png'],
  ['templates/mint-editorial-cv/preview/output-debug-page-2.png', 'cv/output-debug-page-2.png'],
  // Hero artwork
  ['assets/readme/graphcompose-ai-flow.jpg', 'hero/graphcompose-ai-flow.jpg'],
];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function main() {
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
  }
  await ensureDir(outDir);

  let copied = 0;
  for (const [src, dst] of assets) {
    const absSrc = join(repoRoot, src);
    const absDst = join(outDir, dst);
    if (!existsSync(absSrc)) {
      throw new Error(`sync-assets: missing source file ${relative(repoRoot, absSrc)}`);
    }
    await ensureDir(dirname(absDst));
    await copyFile(absSrc, absDst);
    copied += 1;
  }
  console.log(`sync-assets: copied ${copied} files into ${relative(repoRoot, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
