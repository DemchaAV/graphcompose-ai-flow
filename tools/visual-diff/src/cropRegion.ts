/**
 * Region cropping for correction passes.
 *
 * The measured case: a one-sentence visual correction ("too close to the
 * divider") cost 39 model requests carrying two full pages of pixels each.
 * What the pass actually needed was the neighbourhood of one region, on both
 * images. Cropping is mechanical, so it belongs in a tool.
 *
 * Bounds are FRACTIONS of the page (top-left origin, 0..1), not pixels —
 * deliberately different from mask-regions' pixel rects. A mask pairs two
 * same-size renders, so pixels are exact there; a crop pairs a reference and
 * an output that usually differ in resolution, and one fractional rect
 * projects onto each image's own pixel grid without resampling either.
 *
 * Pure pngjs, same as the rest of this tool: no ImageMagick dependency, so it
 * runs identically on a dev machine, in CI, and inside an installed harness.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

/** A rectangle as fractions of the page, top-left origin. */
export interface FractionalBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropResult {
  /** The rect actually cut, in this image's pixels, after padding and clamping. */
  rect: { x: number; y: number; w: number; h: number };
  imageWidth: number;
  imageHeight: number;
}

/** Validate fractional bounds: inside the unit square, with positive area. */
export function assertFractionalBounds(bounds: FractionalBounds): void {
  const { x, y, w, h } = bounds;
  for (const [name, value] of Object.entries({ x, y, w, h })) {
    if (!Number.isFinite(value)) {
      throw new Error(`bounds.${name} is not a number`);
    }
  }
  if (w <= 0 || h <= 0) {
    throw new Error(`bounds have no area (w=${w}, h=${h})`);
  }
  if (x < 0 || y < 0 || x + w > 1 || y + h > 1) {
    throw new Error(
      `bounds leave the page (x=${x}, y=${y}, w=${w}, h=${h}) — fractions must stay within 0..1`,
    );
  }
}

/**
 * Project fractional bounds onto an image, pad, clamp, and crop.
 *
 * Padding is a fraction of the page too (default 2%), because a crop cut
 * exactly at the region's edge hides the context that makes a misalignment
 * visible — "too close to the divider" needs the divider in frame.
 */
export function cropPng(
  source: Buffer,
  bounds: FractionalBounds,
  pad = 0.02,
): { png: Buffer; result: CropResult } {
  assertFractionalBounds(bounds);
  const image = PNG.sync.read(source);

  const x0 = Math.max(0, Math.floor((bounds.x - pad) * image.width));
  const y0 = Math.max(0, Math.floor((bounds.y - pad) * image.height));
  const x1 = Math.min(image.width, Math.ceil((bounds.x + bounds.w + pad) * image.width));
  const y1 = Math.min(image.height, Math.ceil((bounds.y + bounds.h + pad) * image.height));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) {
    throw new Error(`the projected rect is empty on a ${image.width}x${image.height} image`);
  }

  const out = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row += 1) {
    const from = ((y0 + row) * image.width + x0) * 4;
    image.data.copy(out.data, row * w * 4, from, from + w * 4);
  }

  return {
    png: PNG.sync.write(out),
    result: { rect: { x: x0, y: y0, w, h }, imageWidth: image.width, imageHeight: image.height },
  };
}

/** Crop one file to another. */
export async function cropFile(
  sourcePath: string,
  targetPath: string,
  bounds: FractionalBounds,
  pad = 0.02,
): Promise<CropResult> {
  const source = await readFile(sourcePath);
  const { png, result } = cropPng(source, bounds, pad);
  await writeFile(targetPath, png);
  return result;
}
