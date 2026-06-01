/**
 * Unit tests for mask-regions.
 *
 * Covers the pure-function surface only — CLI wiring is exercised by
 * the existing visual-diff CI smoke job, which we extend in a sibling
 * commit to call the new bin once per push.
 */

import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

import {
  maskRegions,
  parseColor,
  parseRegions,
  DEFAULT_MASK_COLOR,
  type Region,
} from '../src/mask-regions.js';

function solidPng(width: number, height: number, r: number, g: number, b: number, a = 255): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
  return png;
}

function pixelAt(png: PNG, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const idx = (y * png.width + x) * 4;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

describe('parseColor', () => {
  it('parses named colours', () => {
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
  it('parses #RGB shorthand', () => {
    expect(parseColor('#f0a')).toEqual({ r: 255, g: 0, b: 170, a: 255 });
  });
  it('parses #RGBA shorthand', () => {
    expect(parseColor('#f0a8')).toEqual({ r: 255, g: 0, b: 170, a: 136 });
  });
  it('parses #RRGGBB', () => {
    expect(parseColor('#181818')).toEqual({ r: 24, g: 24, b: 24, a: 255 });
  });
  it('parses #RRGGBBAA', () => {
    expect(parseColor('#18181880')).toEqual({ r: 24, g: 24, b: 24, a: 128 });
  });
  it('rejects garbage', () => {
    expect(() => parseColor('#xx')).toThrow();
    expect(() => parseColor('blue-ish')).toThrow();
  });
});

describe('parseRegions', () => {
  it('accepts a top-level array', () => {
    const out = parseRegions('[{"x":0,"y":0,"w":10,"h":5,"label":"H"}]');
    expect(out).toEqual([{ x: 0, y: 0, w: 10, h: 5, label: 'H' }]);
  });
  it('accepts { regions: [...] }', () => {
    const out = parseRegions('{"regions":[{"x":1,"y":2,"w":3,"h":4}]}');
    expect(out).toEqual([{ x: 1, y: 2, w: 3, h: 4, label: undefined }]);
  });
  it('rejects non-numeric region fields', () => {
    expect(() => parseRegions('[{"x":"a","y":0,"w":1,"h":1}]')).toThrow();
  });
  it('rejects unknown shapes', () => {
    expect(() => parseRegions('{"foo":1}')).toThrow();
  });
});

describe('maskRegions — mask-out mode', () => {
  it('paints a single rectangle and leaves the rest untouched', () => {
    const png = solidPng(10, 10, 100, 100, 100);
    const masked = maskRegions(
      png,
      [{ x: 2, y: 2, w: 3, h: 3 }],
      { mode: 'mask-out', color: { r: 255, g: 255, b: 255, a: 255 } },
    );
    // inside the rect: white
    expect(pixelAt(masked, 2, 2)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixelAt(masked, 4, 4)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    // outside: unchanged
    expect(pixelAt(masked, 0, 0)).toEqual({ r: 100, g: 100, b: 100, a: 255 });
    expect(pixelAt(masked, 9, 9)).toEqual({ r: 100, g: 100, b: 100, a: 255 });
    // edge: rect is half-open (x..x+w-1), so x+w is OUTSIDE
    expect(pixelAt(masked, 5, 5)).toEqual({ r: 100, g: 100, b: 100, a: 255 });
  });

  it('paints multiple rectangles', () => {
    const png = solidPng(10, 10, 50, 50, 50);
    const regions: Region[] = [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 7, y: 7, w: 2, h: 2 },
    ];
    const masked = maskRegions(png, regions, { mode: 'mask-out', color: DEFAULT_MASK_COLOR });
    expect(pixelAt(masked, 0, 0).r).toBe(255);
    expect(pixelAt(masked, 1, 1).r).toBe(255);
    expect(pixelAt(masked, 8, 8).r).toBe(255);
    expect(pixelAt(masked, 4, 4).r).toBe(50);
  });

  it('clamps regions partially outside the PNG', () => {
    const png = solidPng(5, 5, 10, 20, 30);
    const masked = maskRegions(
      png,
      [{ x: 3, y: 3, w: 999, h: 999 }],
      { mode: 'mask-out', color: { r: 0, g: 0, b: 0, a: 255 } },
    );
    expect(pixelAt(masked, 4, 4)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(pixelAt(masked, 0, 0)).toEqual({ r: 10, g: 20, b: 30, a: 255 });
  });

  it('does not mutate the source PNG', () => {
    const png = solidPng(4, 4, 200, 200, 200);
    const original = Buffer.from(png.data);
    maskRegions(png, [{ x: 0, y: 0, w: 4, h: 4 }], { mode: 'mask-out', color: DEFAULT_MASK_COLOR });
    expect(Buffer.compare(png.data, original)).toBe(0);
  });

  it('is a no-op when the region array is empty', () => {
    const png = solidPng(4, 4, 77, 77, 77);
    const masked = maskRegions(png, [], { mode: 'mask-out', color: DEFAULT_MASK_COLOR });
    expect(Buffer.compare(masked.data, png.data)).toBe(0);
  });
});

describe('maskRegions — keep-only mode', () => {
  it('paints everything outside the rectangle', () => {
    const png = solidPng(8, 8, 33, 66, 99);
    const masked = maskRegions(
      png,
      [{ x: 2, y: 2, w: 3, h: 3 }],
      { mode: 'keep-only', color: { r: 255, g: 255, b: 255, a: 255 } },
    );
    // inside: original colour preserved
    expect(pixelAt(masked, 3, 3)).toEqual({ r: 33, g: 66, b: 99, a: 255 });
    expect(pixelAt(masked, 4, 4)).toEqual({ r: 33, g: 66, b: 99, a: 255 });
    // outside: white
    expect(pixelAt(masked, 0, 0)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixelAt(masked, 7, 7)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  it('paints the whole PNG when the region list is empty', () => {
    const png = solidPng(4, 4, 12, 34, 56);
    const masked = maskRegions(png, [], { mode: 'keep-only', color: DEFAULT_MASK_COLOR });
    expect(pixelAt(masked, 0, 0)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(pixelAt(masked, 3, 3)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });
});

describe('maskRegions — round-trip invariant', () => {
  it('mask-out then mask-out with the same regions is idempotent', () => {
    const png = solidPng(6, 6, 100, 100, 100);
    const regions: Region[] = [{ x: 1, y: 1, w: 2, h: 2 }];
    const opts = { mode: 'mask-out' as const, color: DEFAULT_MASK_COLOR };
    const once = maskRegions(png, regions, opts);
    const twice = maskRegions(once, regions, opts);
    expect(Buffer.compare(once.data, twice.data)).toBe(0);
  });
});
