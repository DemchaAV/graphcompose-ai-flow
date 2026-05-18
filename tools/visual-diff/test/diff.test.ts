import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { loadPng, runDiff } from '../src/diff.js';
import { flippedPng, solidPng } from './helpers.js';

const FIXTURES_DIR = resolve(
  fileURLToPath(new URL('../fixtures/', import.meta.url)),
);

async function writeTmpPng(name: string, buf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'visual-diff-test-'));
  const path = join(dir, name);
  await writeFile(path, buf);
  return path;
}

describe('runDiff', () => {
  it('reports zero mismatch for byte-identical fixtures', async () => {
    const a = await loadPng(join(FIXTURES_DIR, 'identical-a.png'));
    const b = await loadPng(join(FIXTURES_DIR, 'identical-b.png'));
    const result = runDiff(a, b);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    expect(result.totalPx).toBe(32 * 32);
    expect(result.mismatchPx).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.parityScore).toBe(100);
    expect(result.classification).toBe('IDENTICAL');
    // diff image is a real PNG buffer with the same dimensions
    const decoded = PNG.sync.read(result.diffImage);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
  });

  it('flags a single-pixel change as MINOR', async () => {
    const base = { width: 32, height: 32 } as const;
    const refBuf = solidPng({ ...base, fill: [255, 255, 255, 255] });
    const outBuf = flippedPng(
      { ...base, fill: [255, 255, 255, 255] },
      1,
      [0, 0, 0, 255],
    );
    const refPath = await writeTmpPng('ref.png', refBuf);
    const outPath = await writeTmpPng('out.png', outBuf);
    const ref = await loadPng(refPath);
    const out = await loadPng(outPath);
    const result = runDiff(ref, out);
    expect(result.mismatchPx).toBe(1);
    expect(result.totalPx).toBe(32 * 32);
    expect(result.classification).toBe('MINOR');
    expect(result.parityScore).toBe(100);
  });

  it('flags a 50%-different image pair as CRITICAL with a low parity score', async () => {
    const base = { width: 32, height: 32 } as const;
    const total = base.width * base.height;
    const refBuf = solidPng({ ...base, fill: [255, 255, 255, 255] });
    const outBuf = flippedPng(
      { ...base, fill: [255, 255, 255, 255] },
      Math.floor(total / 2),
      [0, 0, 0, 255],
    );
    const refPath = await writeTmpPng('ref.png', refBuf);
    const outPath = await writeTmpPng('out.png', outBuf);
    const ref = await loadPng(refPath);
    const out = await loadPng(outPath);
    const result = runDiff(ref, out);
    expect(result.mismatchPx).toBe(Math.floor(total / 2));
    expect(result.classification).toBe('CRITICAL');
    expect(result.parityScore).toBeLessThan(10);
  });

  it('throws when image dimensions differ', async () => {
    const refBuf = solidPng({ width: 32, height: 32 });
    const outBuf = solidPng({ width: 16, height: 32 });
    const refPath = await writeTmpPng('ref.png', refBuf);
    const outPath = await writeTmpPng('out.png', outBuf);
    const ref = await loadPng(refPath);
    const out = await loadPng(outPath);
    expect(() => runDiff(ref, out)).toThrow(/dimensions differ/i);
  });

  it('throws when threshold is out of range', async () => {
    const buf = solidPng({ width: 8, height: 8 });
    const refPath = await writeTmpPng('ref.png', buf);
    const ref = await loadPng(refPath);
    expect(() => runDiff(ref, ref, { threshold: 1.5 })).toThrow(/threshold/);
    expect(() => runDiff(ref, ref, { threshold: -0.1 })).toThrow(/threshold/);
  });

  it('throws a helpful error when the PNG is missing', async () => {
    await expect(loadPng(join(FIXTURES_DIR, 'does-not-exist.png'))).rejects.toThrow(
      /not found/i,
    );
  });
});
