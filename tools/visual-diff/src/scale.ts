/**
 * Reference scaling for the diff.
 *
 * pixelmatch requires equal dimensions, and a reference screenshot almost
 * never matches the render's resolution. Until now every run solved this
 * itself — the serif acceptance run shelled out to ImageMagick and left
 * arithmetic junk files in the user's project root. Scaling is mechanical,
 * so it belongs here, next to the comparison that needs it.
 *
 * Bilinear, pure JS. The point is not to match ImageMagick's resampling —
 * it is to be *the same* every run, so diff numbers are comparable across
 * passes. The classification already treats anti-aliased edges as noise,
 * which is where resampling methods differ.
 */

import { PNG } from 'pngjs';

import type { LoadedPng } from './diff.js';

/** Scale `source` to exactly `width`×`height`, bilinear. */
export function scaleTo(source: LoadedPng, width: number, height: number): LoadedPng {
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`cannot scale to ${width}x${height}`);
  }
  if (source.width === width && source.height === height) return source;

  const out = Buffer.alloc(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;

  for (let y = 0; y < height; y += 1) {
    // Sample at the pixel centre, so a 2x downscale reads between rows
    // rather than always from the top one.
    const sy = Math.min(source.height - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const fx = sx - x0;

      const to = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        // Buffer indexing is number|undefined under noUncheckedIndexedAccess;
        // the indices are clamped above, so 0 is unreachable and harmless.
        const p00 = source.data[(y0 * source.width + x0) * 4 + channel] ?? 0;
        const p10 = source.data[(y0 * source.width + x1) * 4 + channel] ?? 0;
        const p01 = source.data[(y1 * source.width + x0) * 4 + channel] ?? 0;
        const p11 = source.data[(y1 * source.width + x1) * 4 + channel] ?? 0;
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[to + channel] = Math.round(top + (bottom - top) * fy);
      }
    }
  }

  return { width, height, data: out };
}

/** Encode a LoadedPng back to a PNG buffer. */
export function encodePng(image: LoadedPng): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  image.data.copy(png.data);
  return PNG.sync.write(png);
}
