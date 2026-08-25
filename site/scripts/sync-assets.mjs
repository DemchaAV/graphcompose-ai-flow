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
  // The two runs the current harness produced, as the landing page shows them:
  // reference, what one request produced, and the result after corrections.
  // These are the same files README.md uses, so the page and the front of the
  // repository cannot show different work.
  ['assets/readme/v0.5/navy-reference.jpg', 'runs/navy-reference.jpg'],
  ['assets/readme/v0.5/navy-one-request.png', 'runs/navy-one-request.png'],
  ['assets/readme/v0.5/navy-final.png', 'runs/navy-final.png'],
  ['assets/readme/v0.5/serif-reference.jpg', 'runs/serif-reference.jpg'],
  ['assets/readme/v0.5/serif-one-request.png', 'runs/serif-one-request.png'],
  ['assets/readme/v0.5/serif-final.png', 'runs/serif-final.png'],
  // Hero artwork.
  ['assets/readme/graphcompose-ai-flow.png', 'hero/graphcompose-ai-flow.png'],
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
