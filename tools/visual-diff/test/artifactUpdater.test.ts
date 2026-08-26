import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  renderClassificationMarkdown,
  updateRevision,
  type VisualDiffStats,
} from '../src/artifactUpdater.js';
import { solidPng } from './helpers.js';

const SAMPLE_STATS: VisualDiffStats = {
  reference: '/abs/ref.png',
  output: '/abs/out.png',
  diff: '/abs/diff.png',
  width: 800,
  height: 1100,
  totalPx: 880_000,
  mismatchPx: 13,
  percent: 0.0015,
  parityScore: 100,
  classification: 'MINOR',
  threshold: 0.1,
  includeAA: false,
};

async function mkTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'visual-diff-revision-'));
}

describe('updateRevision', () => {
  it('writes the three expected files into a fresh revision folder', async () => {
    const folder = await mkTmpDir();
    const diffImage = solidPng({ width: 4, height: 4, fill: [0, 0, 0, 255] });

    const result = await updateRevision({
      folder,
      diffImage,
      stats: SAMPLE_STATS,
    });

    expect(result.diffPath).toBe(join(folder, 'output-diff.png'));
    expect(result.statsPath).toBe(join(folder, 'visual-diff-stats.json'));
    expect(result.classificationPath).toBe(
      join(folder, 'visual-review-classification.md'),
    );

    const diffOnDisk = await readFile(result.diffPath);
    expect(diffOnDisk.equals(diffImage)).toBe(true);

    const statsText = await readFile(result.statsPath, 'utf8');
    const parsed = JSON.parse(statsText) as VisualDiffStats;
    expect(parsed.classification).toBe('MINOR');
    // diff path is localized to the revision-relative file name
    expect(parsed.diff).toBe('output-diff.png');
    // 2-space indentation matches the rest of the repo
    expect(statsText).toContain('\n  "width": 800');

    const mdText = await readFile(result.classificationPath, 'utf8');
    expect(mdText).toContain('# Visual Review');
    expect(mdText).toContain('## Reference Parity Score');
    expect(mdText).toContain('`100`');
    expect(mdText).toContain('## Mismatch Classification');
    expect(mdText).toContain('`MINOR`');
    expect(mdText).toContain('docs/visual-accuracy-contract.md');
  });

  it('overwrites instead of appending when called twice', async () => {
    const folder = await mkTmpDir();
    const diffImage = solidPng({ width: 4, height: 4, fill: [0, 0, 0, 255] });

    await updateRevision({ folder, diffImage, stats: SAMPLE_STATS });
    const secondStats: VisualDiffStats = {
      ...SAMPLE_STATS,
      mismatchPx: 4400,
      percent: 0.5,
      parityScore: 98,
      classification: 'MAJOR',
    };
    await updateRevision({ folder, diffImage, stats: secondStats });

    const mdText = await readFile(
      join(folder, 'visual-review-classification.md'),
      'utf8',
    );
    // Only one Mismatch Classification heading is present.
    const headingCount = mdText.split('## Mismatch Classification').length - 1;
    expect(headingCount).toBe(1);
    expect(mdText).toContain('`MAJOR`');
    expect(mdText).not.toContain('`MINOR`');

    const statsText = await readFile(
      join(folder, 'visual-diff-stats.json'),
      'utf8',
    );
    const parsed = JSON.parse(statsText) as VisualDiffStats;
    expect(parsed.classification).toBe('MAJOR');
    expect(parsed.parityScore).toBe(98);
  });

  it('creates the revision folder if it does not yet exist', async () => {
    const parent = await mkTmpDir();
    const folder = join(parent, 'fresh-revision');
    const diffImage = solidPng({ width: 2, height: 2 });

    const result = await updateRevision({
      folder,
      diffImage,
      stats: SAMPLE_STATS,
    });

    const entries = await readdir(folder);
    expect(entries).toContain('output-diff.png');
    expect(entries).toContain('visual-diff-stats.json');
    expect(entries).toContain('visual-review-classification.md');
    expect(result.diffPath).toBe(join(folder, 'output-diff.png'));
  });

  it('does not leave temp files behind on success', async () => {
    const folder = await mkTmpDir();
    const diffImage = solidPng({ width: 2, height: 2 });
    await updateRevision({ folder, diffImage, stats: SAMPLE_STATS });
    const entries = await readdir(folder);
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('the classification snippet and a distorted reference', () => {
  it('leads with the distortion, because this file is what a human reads', () => {
    // `output-diff-classification.md` is the artifact the review skill tells a
    // reviewer to paste into visual-review.md. It printed "0.3% — MINOR" with
    // no hint that the reference had been stretched to produce it, while the
    // stats field's own contract says no reader can conclude "the pixels
    // matched" without being told what was done to make them.
    const stats: VisualDiffStats = {
      reference: 'reference.png',
      output: 'output.png',
      diff: 'output-diff.png',
      width: 1240,
      height: 1753,
      totalPx: 2173720,
      mismatchPx: 6521,
      percent: 0.3,
      parityScore: 99,
      classification: 'MINOR',
      threshold: 0.1,
      includeAA: false,
      aspectMismatch: {
        referenceAspect: 1.28014,
        outputAspect: 1.41371,
        deviationPercent: 9.45,
        tolerancePercent: 1,
      },
    };

    const md = renderClassificationMarkdown(stats);
    const distortionAt = md.indexOf('distorted before these numbers');
    const percentAt = md.indexOf('0.3000');

    expect(distortionAt).toBeGreaterThan(-1);
    expect(percentAt).toBeGreaterThan(-1);
    expect(distortionAt).toBeLessThan(percentAt);
    expect(md).toContain('9.45%');
  });

  it('says nothing when the reference was not distorted', () => {
    const stats: VisualDiffStats = {
      reference: 'reference.png',
      output: 'output.png',
      diff: 'output-diff.png',
      width: 1240,
      height: 1753,
      totalPx: 2173720,
      mismatchPx: 0,
      percent: 0,
      parityScore: 100,
      classification: 'EXACT',
      threshold: 0.1,
      includeAA: false,
    };

    expect(renderClassificationMarkdown(stats)).not.toContain('distorted');
  });
});
