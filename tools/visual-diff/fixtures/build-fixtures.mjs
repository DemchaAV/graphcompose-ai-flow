#!/usr/bin/env node
/**
 * Generate the two committed fixture PNGs used by the test suite.
 *
 * Idempotent: if the files already exist with the expected size and
 * content, the script does nothing. Otherwise it (re)writes them
 * deterministically from a single in-memory buffer so the two outputs
 * are byte-identical.
 *
 * Run manually after a fresh clone if the fixtures are missing:
 *   node fixtures/build-fixtures.mjs
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));

const WIDTH = 32;
const HEIGHT = 32;
const FILL = [255, 255, 255, 255];

function buildSolidPng() {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const idx = (y * WIDTH + x) * 4;
      png.data[idx] = FILL[0];
      png.data[idx + 1] = FILL[1];
      png.data[idx + 2] = FILL[2];
      png.data[idx + 3] = FILL[3];
    }
  }
  return PNG.sync.write(png);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureFixture(name, buffer) {
  const path = join(here, name);
  if (await exists(path)) {
    const onDisk = await readFile(path);
    if (onDisk.equals(buffer)) {
      return { path, action: 'kept' };
    }
  }
  await writeFile(path, buffer);
  return { path, action: 'wrote' };
}

const buffer = buildSolidPng();
const a = await ensureFixture('identical-a.png', buffer);
const b = await ensureFixture('identical-b.png', buffer);

process.stdout.write(
  `${a.action}: ${a.path}\n${b.action}: ${b.path}\n` +
    `dimensions: ${WIDTH}x${HEIGHT}, identical: true\n`,
);
