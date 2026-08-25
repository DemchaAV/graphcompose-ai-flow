/**
 * cropRegion.test.ts — one fractional rect, two pixel grids, corresponding
 * crops.
 *
 * The tool exists so a correction pass reads two crops instead of two pages.
 * That only works if the crops actually correspond: the same page fraction
 * must land on the same visual area of a 1024-wide reference and a 1240-wide
 * render. So the tests paint a known rectangle at a known fraction, crop at
 * that fraction on two different resolutions, and assert both crops are the
 * painted colour.
 */

import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

import { assertFractionalBounds, cropPng } from '../src/cropRegion.js';

/** A width×height page, `base` coloured, with one `mark`-coloured rect at fractions. */
function page(
  width: number,
  height: number,
  frac: { x: number; y: number; w: number; h: number },
): Buffer {
  const png = new PNG({ width, height });
  const inMark = (px: number, py: number) =>
    px >= frac.x * width &&
    px < (frac.x + frac.w) * width &&
    py >= frac.y * height &&
    py < (frac.y + frac.h) * height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const mark = inMark(x, y);
      png.data[at] = mark ? 200 : 30; // r
      png.data[at + 1] = mark ? 40 : 30; // g
      png.data[at + 2] = mark ? 40 : 30; // b
      png.data[at + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const MARK = { x: 0.25, y: 0.5, w: 0.3, h: 0.2 };

function redShare(buffer: Buffer): number {
  const png = PNG.sync.read(buffer);
  let red = 0;
  let total = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    total += 1;
    if (png.data[i] > 100) red += 1;
  }
  return red / total;
}

describe('cropPng', () => {
  it('projects the same fraction onto different resolutions', () => {
    // Different pixel grids, the same page area. Zero padding makes the crop
    // exactly the mark, so both crops must be essentially all mark-coloured.
    for (const [width, height] of [
      [1024, 1536],
      [1240, 1753],
    ] as const) {
      const { png, result } = cropPng(page(width, height, MARK), MARK, 0);
      expect(result.imageWidth).toBe(width);
      expect(redShare(png)).toBeGreaterThan(0.95);
      expect(result.rect.w).toBeGreaterThan(0);
    }
  });

  it('padding brings surrounding context into frame', () => {
    // "Too close to the divider" needs the divider in the crop — an exact-edge
    // crop hides precisely the relationship being judged.
    const { png } = cropPng(page(1000, 1000, MARK), MARK, 0.05);
    const share = redShare(png);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.9); // the padding is visibly NOT mark-coloured
  });

  it('clamps padding at the page edge instead of failing', () => {
    const edge = { x: 0, y: 0, w: 0.2, h: 0.2 };
    const { result } = cropPng(page(500, 500, edge), edge, 0.1);
    expect(result.rect.x).toBe(0);
    expect(result.rect.y).toBe(0);
  });

  it('the reported rect is exactly what was cut', () => {
    const { png, result } = cropPng(page(800, 600, MARK), MARK, 0.02);
    const out = PNG.sync.read(png);
    expect(out.width).toBe(result.rect.w);
    expect(out.height).toBe(result.rect.h);
  });
});

describe('assertFractionalBounds', () => {
  it('refuses bounds that leave the unit square', () => {
    expect(() => assertFractionalBounds({ x: 0.9, y: 0, w: 0.2, h: 0.1 })).toThrow(/leave the page/);
    expect(() => assertFractionalBounds({ x: -0.1, y: 0, w: 0.2, h: 0.1 })).toThrow(/leave the page/);
  });

  it('refuses empty areas and non-numbers', () => {
    expect(() => assertFractionalBounds({ x: 0, y: 0, w: 0, h: 0.1 })).toThrow(/no area/);
    expect(() => assertFractionalBounds({ x: 0, y: 0, w: Number.NaN, h: 0.1 })).toThrow(/not a number/);
  });
});
