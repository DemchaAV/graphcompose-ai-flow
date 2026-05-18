/**
 * In-test helpers for synthesizing tiny PNG buffers.
 *
 * Keeping these in a single file means the test suite never commits
 * binary fixtures beyond the two `identical-*.png` files in
 * `fixtures/`.
 */

import { PNG } from 'pngjs';

export interface SynthOptions {
  width: number;
  height: number;
  /** RGBA color, 0..255 per channel. Defaults to opaque white. */
  fill?: [number, number, number, number];
}

/**
 * Create a PNG buffer filled with a single color.
 */
export function solidPng(options: SynthOptions): Buffer {
  const { width, height } = options;
  const [r, g, b, a] = options.fill ?? [255, 255, 255, 255];
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

/**
 * Create a PNG buffer that flips a configurable subset of pixels to
 * a contrasting color.
 *
 * `pixelsToFlip` is the count of pixels that should differ from the
 * base color. Pixels are flipped in row-major order.
 */
export function flippedPng(
  base: SynthOptions,
  pixelsToFlip: number,
  flippedColor: [number, number, number, number] = [0, 0, 0, 255],
): Buffer {
  const { width, height } = base;
  const total = width * height;
  if (pixelsToFlip < 0 || pixelsToFlip > total) {
    throw new Error(
      `pixelsToFlip must be in [0, ${total}], got ${pixelsToFlip}`,
    );
  }
  const [r, g, b, a] = base.fill ?? [255, 255, 255, 255];
  const [fr, fg, fb, fa] = flippedColor;
  const png = new PNG({ width, height });
  for (let i = 0; i < total; i += 1) {
    const idx = i * 4;
    if (i < pixelsToFlip) {
      png.data[idx] = fr;
      png.data[idx + 1] = fg;
      png.data[idx + 2] = fb;
      png.data[idx + 3] = fa;
    } else {
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}
