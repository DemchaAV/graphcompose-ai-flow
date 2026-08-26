/**
 * Pure file IO inside a revision folder.
 *
 * Writes three artifacts for the Visual Review Agent and Revision
 * Manager to consume:
 *
 *   <folder>/output-diff.png
 *   <folder>/visual-diff-stats.json
 *   <folder>/visual-review-classification.md
 *
 * Idempotent: running twice overwrites the existing files, never
 * appends a duplicate section to the classification snippet.
 *
 * Writes are atomic: tmp file + rename in the same directory.
 */

import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import type { Classification } from './classify.js';
import type { AspectMismatch } from './aspect.js';

export interface VisualDiffStats {
  reference: string;
  output: string;
  diff: string;
  width: number;
  height: number;
  totalPx: number;
  mismatchPx: number;
  percent: number;
  parityScore: number;
  classification: Classification;
  threshold: number;
  includeAA: boolean;
  /**
   * Present only when the reference was scaled to a different SHAPE, not just a
   * different size.
   *
   * `--scale-reference` resamples the reference to the render's exact width and
   * height, which is right when the two differ only in dpi and wrong when they
   * differ in proportion: a reference that is 5% shorter than the render gets
   * stretched to match right before the pixels are compared, and the diff then
   * reports parity on a page whose every vertical position is off. Three
   * projects shipped that way. The stats carry the fact so that no reader of
   * this file — human or otherwise — can conclude "the pixels matched" without
   * also being told what was done to make them.
   */
  aspectMismatch?: AspectMismatch;
}

export interface UpdateRevisionOptions {
  folder: string;
  diffImage: Buffer;
  stats: VisualDiffStats;
}

export interface UpdateRevisionResult {
  diffPath: string;
  statsPath: string;
  classificationPath: string;
}

const DIFF_FILE = 'output-diff.png';
const STATS_FILE = 'visual-diff-stats.json';
const CLASSIFICATION_FILE = 'visual-review-classification.md';

/**
 * Write the three revision artifacts atomically.
 *
 * The stats JSON path inside the file points at the revision-local
 * diff file name, so callers can ignore the original absolute path
 * once the snippet is committed.
 */
export async function updateRevision(
  options: UpdateRevisionOptions,
): Promise<UpdateRevisionResult> {
  const folder = resolve(options.folder);
  await assertDir(folder);

  const diffPath = join(folder, DIFF_FILE);
  const statsPath = join(folder, STATS_FILE);
  const classificationPath = join(folder, CLASSIFICATION_FILE);

  // Rewrite the stats to point at the in-folder diff file name, so
  // the JSON is portable inside the revision folder.
  const localizedStats: VisualDiffStats = {
    ...options.stats,
    diff: DIFF_FILE,
  };

  const statsJson = `${JSON.stringify(localizedStats, null, 2)}\n`;
  const classificationMd = renderClassificationMarkdown(localizedStats);

  await Promise.all([
    atomicWrite(diffPath, options.diffImage),
    atomicWrite(statsPath, Buffer.from(statsJson, 'utf8')),
    atomicWrite(classificationPath, Buffer.from(classificationMd, 'utf8')),
  ]);

  return { diffPath, statsPath, classificationPath };
}

export function renderClassificationMarkdown(stats: VisualDiffStats): string {
  // Headings match the suggested format in
  // docs/visual-review-loop.md so a human can paste this snippet
  // straight into visual-review.md.
  const percentText = stats.percent.toFixed(4);
  // Above everything, and before the number it invalidates. This file is what
  // the review skill tells a reader to paste into visual-review.md, so it is
  // the one human-facing rendering of these figures — and until now it printed
  // "0.3% — MINOR" with no hint that the reference had been stretched to
  // produce it. The stats field's own contract is that no reader can conclude
  // "the pixels matched" without being told what was done to make them; this
  // is the reader that could.
  const distortion: string[] = stats.aspectMismatch
    ? [
        '> **The reference was distorted before these numbers were measured.**',
        `> Reference aspect \`${stats.aspectMismatch.referenceAspect}\`, render ` +
          `\`${stats.aspectMismatch.outputAspect}\` — ` +
          `\`${stats.aspectMismatch.deviationPercent}%\` apart. ` +
          '`--scale-reference` stretched one onto the other, so every figure below ' +
          'UNDERSTATES the real difference and none of them can be classified until ' +
          'the page size is settled. This is a wrong page size, not a wrong layout: ' +
          'settle it with `scripts/import-reference.mjs` and re-render.',
        '',
      ]
    : [];
  const lines: string[] = [
    '# Visual Review',
    '',
    ...distortion,
    '## Summary',
    '',
    `Auto-generated pixel-diff classification. See \`visual-diff-stats.json\` for raw counts and \`${DIFF_FILE}\` for the highlight image.`,
    '',
    '## Reference Parity Score',
    '',
    `\`${stats.parityScore}\``,
    '',
    '## Mismatch Classification',
    '',
    `- classification: \`${stats.classification}\``,
    `- mismatch percent: \`${percentText}%\``,
    `- mismatch pixels: \`${stats.mismatchPx} / ${stats.totalPx}\``,
    `- pixelmatch threshold: \`${stats.threshold}\``,
    `- include anti-aliased pixels: \`${stats.includeAA}\``,
    '',
    '## Notes',
    '',
    // Named, not linked. This file is written into a revision folder whose
    // depth below the harness varies — and in an installed harness the
    // workspace is not under the harness at all, so no relative path can
    // reach the document. The link that used to be here resolved from
    // nowhere: every revision on disk carried it broken.
    'The labels `ACCEPTED_LIMITATION` and `INTENTIONAL_DIFFERENCE` are never auto-applied here; they require a human note. The canonical label definitions are in the harness at `docs/visual-accuracy-contract.md`.',
    '',
  ];
  return lines.join('\n');
}

async function atomicWrite(target: string, contents: Buffer): Promise<void> {
  const dir = dirname(target);
  const suffix = randomBytes(6).toString('hex');
  const tmp = join(dir, `.${basename(target)}.${suffix}.tmp`);
  try {
    await writeFile(tmp, contents);
    await rename(tmp, target);
  } catch (err) {
    await safeUnlink(tmp);
    throw err;
  }
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // best-effort cleanup of the tmp file
  }
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  return slash === -1 ? norm : norm.slice(slash + 1);
}

async function assertDir(folder: string): Promise<void> {
  try {
    const info = await stat(folder);
    if (!info.isDirectory()) {
      throw new Error(`Path is not a directory: ${folder}`);
    }
    return;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      await mkdir(folder, { recursive: true });
      return;
    }
    throw err;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in (err as Record<string, unknown>)
  );
}
