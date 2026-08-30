/**
 * Commander wiring for the visual-diff CLI.
 *
 * Usage:
 *   visual-diff <reference.png> <output.png> [--out diff.png]
 *                                            [--threshold 0..1]
 *                                            [--include-aa]
 *                                            [--json]
 *                                            [--update-revision <folder>]
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command, InvalidArgumentError } from 'commander';

import { loadPng, runDiff, type DiffResult } from './diff.js';
import { encodePng, scaleTo } from './scale.js';
import {
  updateRevision,
  type VisualDiffStats,
} from './artifactUpdater.js';
import {
  aspectMismatchOf,
  formatAspectWarning,
  type AspectMismatch,
} from './aspect.js';

interface CliOptions {
  out: string;
  threshold: number;
  includeAa: boolean;
  json: boolean;
  updateRevision?: string;
  scaleReference: boolean;
  saveScaled?: string;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('visual-diff')
    .description(
      'Pixel-diff two PNG images and classify the mismatch against the ' +
        'GraphCompose visual accuracy contract.',
    )
    .argument('<reference>', 'reference PNG (the target / expected image)')
    .argument('<output>', 'rendered output PNG to compare')
    .option('--out <file>', 'diff PNG path', './diff.png')
    .option(
      '--threshold <number>',
      'pixelmatch threshold in [0, 1]',
      parseThreshold,
      0.1,
    )
    .option(
      '--include-aa',
      'include anti-aliased pixels in the diff (default: ignored)',
      false,
    )
    .option('--json', 'print machine-readable stats JSON', false)
    .option(
      '--scale-reference',
      'when dimensions differ, scale the reference to the output size before diffing',
      false,
    )
    .option(
      '--save-scaled <file>',
      'write the scaled reference here (with --scale-reference), so later passes and crop-region reuse it',
    )
    .option(
      '--update-revision <folder>',
      'also write diff.png + stats.json + classification snippet into the revision folder',
    )
    .action(async (referenceArg: string, outputArg: string, raw: unknown) => {
      const options = normalizeOptions(raw);
      await runCli(referenceArg, outputArg, options);
    });

  return program;
}

function parseThreshold(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new InvalidArgumentError('threshold must be a number in [0, 1]');
  }
  return n;
}

function normalizeOptions(raw: unknown): CliOptions {
  const r = raw as Record<string, unknown>;
  const threshold = typeof r.threshold === 'number' ? r.threshold : 0.1;
  const updateRevision =
    typeof r.updateRevision === 'string' ? r.updateRevision : undefined;
  return {
    out: typeof r.out === 'string' ? r.out : './diff.png',
    threshold,
    includeAa: r.includeAa === true,
    json: r.json === true,
    updateRevision,
    scaleReference: r.scaleReference === true,
    saveScaled: typeof r.saveScaled === 'string' ? r.saveScaled : undefined,
  };
}

async function runCli(
  referenceArg: string,
  outputArg: string,
  options: CliOptions,
): Promise<void> {
  const referencePath = resolve(referenceArg);
  const outputPath = resolve(outputArg);
  const diffPath = resolve(options.out);

  let [reference, output] = await Promise.all([
    loadPng(referencePath),
    loadPng(outputPath),
  ]);

  // A reference screenshot almost never matches the render's resolution, and
  // every run used to solve that itself — one shelled out to ImageMagick and
  // left junk files in the user's project. Opt-in, so a deliberate same-size
  // comparison (parent vs child render) can never be silently resampled.
  //
  // Scaling to a different SIZE is a resampling. Scaling to a different SHAPE
  // is a distortion, and the diff cannot tell a reader which one it performed
  // unless it measures first — so measure first, and carry the answer out with
  // the stats. This is the step that hid the page-size defect: a reference 5%
  // shorter than the render was stretched to fit and then reported as matching.
  let scaledReferencePath: string | undefined;
  let aspectMismatch: AspectMismatch | undefined;
  if (
    options.scaleReference &&
    (reference.width !== output.width || reference.height !== output.height)
  ) {
    aspectMismatch = aspectMismatchOf(reference, output);
    reference = scaleTo(reference, output.width, output.height);
    if (options.saveScaled !== undefined) {
      scaledReferencePath = resolve(options.saveScaled);
      await writeFile(scaledReferencePath, encodePng(reference));
    }
  }

  const result = runDiff(reference, output, {
    threshold: options.threshold,
    includeAA: options.includeAa,
  });

  await writeFile(diffPath, result.diffImage);

  const stats: VisualDiffStats = {
    reference: scaledReferencePath ?? referencePath,
    output: outputPath,
    diff: diffPath,
    width: result.width,
    height: result.height,
    totalPx: result.totalPx,
    mismatchPx: result.mismatchPx,
    percent: result.percent,
    parityScore: result.parityScore,
    classification: result.classification,
    threshold: result.threshold,
    includeAA: result.includeAA,
    perceptual: result.perceptual,
    ...(aspectMismatch ? { aspectMismatch } : {}),
  };

  if (options.updateRevision !== undefined) {
    await updateRevision({
      folder: options.updateRevision,
      diffImage: result.diffImage,
      stats,
    });
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
  } else {
    process.stdout.write(formatSummary(stats, result));
  }

  // After the numbers, because it is a warning ABOUT the numbers: a reader who
  // has just been told "0.3% of pixels differ" needs to know in the same breath
  // that the two images were not the same shape to begin with. On stderr, so
  // --json stays parseable.
  if (aspectMismatch) {
    process.stderr.write(formatAspectWarning(aspectMismatch));
  }
}

function formatSummary(stats: VisualDiffStats, result: DiffResult): string {
  const percentText = stats.percent.toFixed(4);
  return (
    `${stats.classification} (parity score ${stats.parityScore})\n` +
    `${stats.mismatchPx} / ${stats.totalPx} pixels differ (${percentText}%); ` +
    `diff written to ${result.width}x${result.height} PNG\n`
  );
}

const isCliEntry = (() => {
  // We are imported by bin/visual-diff.mjs which is the only entry
  // point. Treat any import as a CLI invocation.
  return true;
})();

if (isCliEntry) {
  const program = buildProgram();
  program.parseAsync(process.argv).catch((err: unknown) => {
    const message =
      err instanceof Error ? err.message : String(err);
    process.stderr.write(`visual-diff: ${message}\n`);
    process.exit(1);
  });
}
