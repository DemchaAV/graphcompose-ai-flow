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

function renderClassificationMarkdown(stats: VisualDiffStats): string {
  // Headings match the suggested format in
  // docs/visual-review-loop.md so a human can paste this snippet
  // straight into visual-review.md.
  const percentText = stats.percent.toFixed(4);
  const lines: string[] = [
    '# Visual Review',
    '',
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
    'The labels `ACCEPTED_LIMITATION` and `INTENTIONAL_DIFFERENCE` are never auto-applied here; they require a human note. See [docs/visual-accuracy-contract.md](../../docs/visual-accuracy-contract.md) for the canonical label definitions.',
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
