/**
 * Image diffing primitives.
 *
 * Wraps pngjs (IO) and pixelmatch (compare) behind a small typed
 * surface. The CLI is a thin wrapper over `runDiff`.
 */

import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

import { classifyPercent, parityScore, type Classification } from './classify.js';
import { perceptualSimilarity, type PerceptualResult } from './perceptual.js';

export interface LoadedPng {
  width: number;
  height: number;
  data: Buffer;
}

export interface DiffOptions {
  /**
   * pixelmatch threshold in [0, 1]. Lower = stricter. Default 0.1.
   */
  threshold?: number;
  /**
   * Include anti-aliased pixels in the diff. Default false (ignored).
   */
  includeAA?: boolean;
}

export interface DiffResult {
  width: number;
  height: number;
  totalPx: number;
  mismatchPx: number;
  percent: number;
  parityScore: number;
  classification: Classification;
  /** PNG buffer of the highlight image (red pixels on changes). */
  diffImage: Buffer;
  threshold: number;
  includeAA: boolean;
  /**
   * The perceptual similarity beside the pixel count: SSIM over the
   * downsampled, blurred luminance. Never zero-inflated by anti-aliasing the
   * way `percent` is. See perceptual.ts for why it exists and what its
   * thresholds are worth.
   */
  perceptual: PerceptualResult;
}

/**
 * Decode a PNG from disk.
 *
 * Throws a helpful error if the file is missing or not a valid PNG.
 */
export async function loadPng(filePath: string): Promise<LoadedPng> {
  let raw: Buffer;
  try {
    raw = await readFile(filePath);
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      throw new Error(`PNG not found: ${filePath}`);
    }
    throw new Error(
      `Failed to read PNG at ${filePath}: ${(err as Error).message}`,
    );
  }

  let png: PNG;
  try {
    png = PNG.sync.read(raw);
  } catch (err) {
    throw new Error(
      `Failed to decode PNG at ${filePath}: ${(err as Error).message}`,
    );
  }

  return {
    width: png.width,
    height: png.height,
    data: png.data,
  };
}

/**
 * Compute the diff between two pre-loaded PNGs.
 *
 * Throws if dimensions disagree or the threshold is out of range.
 */
export function runDiff(
  reference: LoadedPng,
  output: LoadedPng,
  options: DiffOptions = {},
): DiffResult {
  const threshold = options.threshold ?? 0.1;
  const includeAA = options.includeAA ?? false;

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(
      `threshold must be in [0, 1], got ${threshold}`,
    );
  }

  if (
    reference.width !== output.width ||
    reference.height !== output.height
  ) {
    throw new Error(
      `Image dimensions differ: reference is ${reference.width}x${reference.height}, ` +
        `output is ${output.width}x${output.height}. ` +
        'Both PNGs must have the same dimensions.',
    );
  }

  const { width, height } = reference;
  const totalPx = width * height;
  const diffPng = new PNG({ width, height });

  const mismatchPx = pixelmatch(
    reference.data,
    output.data,
    diffPng.data,
    width,
    height,
    {
      threshold,
      includeAA,
      // Red highlight on changed pixels.
      diffColor: [255, 0, 0],
      alpha: 0.1,
    },
  );

  const percent = totalPx === 0 ? 0 : (mismatchPx / totalPx) * 100;
  const score = parityScore(percent);
  const classification = classifyPercent(percent);

  const diffImage = PNG.sync.write(diffPng);
  const perceptual = perceptualSimilarity(reference, output);

  return {
    width,
    height,
    totalPx,
    mismatchPx,
    percent,
    parityScore: score,
    classification,
    diffImage,
    threshold,
    includeAA,
    perceptual,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in (err as Record<string, unknown>)
  );
}
