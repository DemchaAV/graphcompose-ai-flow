/**
 * The region diff exists because a whole-page percentage cannot be acted on.
 *
 * These pin the two properties that make the per-region numbers usable: a
 * difference confined to one region is attributed to that region and to no
 * other, and `concentration` separates damage spread evenly across the page
 * from damage piled into one place. The second is the whole instrument — a
 * page whose difference is glyph anti-aliasing has every text region near
 * 1.00x, and a page with a structural defect has one region well above it.
 */

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { decodePng, regionsOfPage, runRegionDiff, type RegionSpec } from '../src/regionDiff.js';
import { solidPng } from './helpers.js';

const WHITE: [number, number, number, number] = [255, 255, 255, 255];

/** A page with a solid black rect painted at a pixel rect. */
function pageWithRect(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number } | null,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const inside =
        rect !== null &&
        x >= rect.x &&
        x < rect.x + rect.w &&
        y >= rect.y &&
        y < rect.y + rect.h;
      png.data[idx] = inside ? 0 : 255;
      png.data[idx + 1] = inside ? 0 : 255;
      png.data[idx + 2] = inside ? 0 : 255;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Four quadrants of a 100x100 page. */
const QUADRANTS: RegionSpec[] = [
  { id: 'top-left', bounds: { x: 0, y: 0, w: 0.5, h: 0.5 } },
  { id: 'top-right', bounds: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
  { id: 'bottom-left', bounds: { x: 0, y: 0.5, w: 0.5, h: 0.5 } },
  { id: 'bottom-right', bounds: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } },
];

describe('runRegionDiff', () => {
  it('attributes a localised difference to the one region that contains it', () => {
    const reference = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));
    // A 10x10 black square inside the top-right quadrant only.
    const output = decodePng(pageWithRect(100, 100, { x: 60, y: 10, w: 10, h: 10 }));

    const result = runRegionDiff(reference, output, QUADRANTS);

    expect(result.pageMismatchPx).toBe(100);
    const byId = new Map(result.regions.map((r) => [r.id, r]));
    expect(byId.get('top-right')!.mismatchPx).toBe(100);
    expect(byId.get('top-left')!.mismatchPx).toBe(0);
    expect(byId.get('bottom-left')!.mismatchPx).toBe(0);
    expect(byId.get('bottom-right')!.mismatchPx).toBe(0);

    // All of the difference in a quarter of the page: four times its share.
    expect(byId.get('top-right')!.shareOfPageMismatch).toBeCloseTo(100, 5);
    expect(byId.get('top-right')!.concentration).toBeCloseTo(4, 5);
    expect(result.ranked[0]).toBe('top-right');
  });

  it('reads near 1.00x when the difference is spread evenly, which is the null case', () => {
    // The reason the number is a ratio and not a raw count: a page whose
    // difference is anti-aliasing on every text region must NOT look like a
    // page with a defect, however large its percentage is.
    const reference = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));
    const png = new PNG({ width: 100, height: 100 });
    for (let i = 0; i < 100 * 100; i += 1) {
      const idx = i * 4;
      // Every fourth pixel, uniformly across the page.
      const flip = i % 4 === 0;
      png.data[idx] = flip ? 0 : 255;
      png.data[idx + 1] = flip ? 0 : 255;
      png.data[idx + 2] = flip ? 0 : 255;
      png.data[idx + 3] = 255;
    }
    const output = decodePng(PNG.sync.write(png));

    const result = runRegionDiff(reference, output, QUADRANTS);

    expect(result.pagePercent).toBeCloseTo(25, 1);
    for (const region of result.regions) {
      expect(region.concentration).toBeCloseTo(1, 1);
    }
  });

  it('scales the reference to the output, so a dpi difference is not a difference', () => {
    const reference = decodePng(solidPng({ width: 50, height: 50, fill: WHITE }));
    const output = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));

    const result = runRegionDiff(reference, output, QUADRANTS);

    expect(result.width).toBe(100);
    expect(result.pageMismatchPx).toBe(0);
    // With nothing to share out, a concentration would be a division by zero
    // dressed up as a measurement.
    for (const region of result.regions) expect(region.concentration).toBeNull();
  });

  it('reports a bounds-less region as unmeasurable, not as a region that matched', () => {
    // The gate hole this closes: `--changed hero` with a bounds-less `footer`
    // measured nothing in the footer, found no trespasser, and exited 0 while
    // the footer that actually changed shipped unnoticed.
    const reference = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));
    const output = decodePng(pageWithRect(100, 100, { x: 60, y: 60, w: 10, h: 10 }));

    const result = runRegionDiff(reference, output, [
      ...QUADRANTS,
      { id: 'footer' } as RegionSpec,
    ]);

    const footer = result.regions.find((r) => r.id === 'footer')!;
    expect(footer.skipped).toMatch(/no bounds recorded/);
    expect(footer.mismatchPx).toBe(0);
    expect(result.ranked).not.toContain('footer');
  });

  it('reports an unusable region rather than dropping it', () => {
    // A region that vanishes from the list reads as a region that matched.
    const reference = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));
    const output = decodePng(pageWithRect(100, 100, { x: 0, y: 0, w: 10, h: 10 }));

    const result = runRegionDiff(reference, output, [
      ...QUADRANTS,
      { id: 'off-page', bounds: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } },
    ]);

    const off = result.regions.find((r) => r.id === 'off-page')!;
    expect(off.skipped).toMatch(/leave the page/);
    expect(result.ranked).not.toContain('off-page');
  });

  it('measures the page total itself, so the shares always share out one number', () => {
    const reference = decodePng(solidPng({ width: 100, height: 100, fill: WHITE }));
    const output = decodePng(pageWithRect(100, 100, { x: 10, y: 10, w: 20, h: 20 }));

    const result = runRegionDiff(reference, output, QUADRANTS);

    const summed = result.regions.reduce((total, r) => total + r.mismatchPx, 0);
    expect(summed).toBe(result.pageMismatchPx);
    const shares = result.regions.reduce((total, r) => total + r.shareOfPageMismatch, 0);
    expect(shares).toBeCloseTo(100, 5);
  });
});

describe('regionsOfPage', () => {
  const analysis = {
    regions: [
      { id: 'header', bounds: { x: 0, y: 0, w: 1, h: 0.1 } },
      { id: 'cover-art', page: 1, bounds: { x: 0, y: 0.1, w: 1, h: 0.5 } },
      { id: 'continuation', page: 2, bounds: { x: 0, y: 0, w: 1, h: 0.2 } },
      { id: 'no-bounds' },
    ],
  };

  it('defaults a region with no page to page 1, which is what a one-page analysis writes', () => {
    expect(regionsOfPage(analysis).map((r) => r.id)).toEqual(['header', 'cover-art', 'no-bounds']);
  });

  it('keeps a region that has no bounds, because bounds are optional in the schema', () => {
    // visual-analysis.schema.json requires only id/label/role. Filtering a
    // bounds-less region out here made it indistinguishable from a region
    // that matched — and made its id unnameable in --changed, so it was
    // simultaneously unguardable and unmentionable.
    const kept = regionsOfPage(analysis).find((r) => r.id === 'no-bounds');
    expect(kept).toBeDefined();
    expect(kept!.bounds).toBeUndefined();
  });

  it('selects a later page without dragging page 1 along', () => {
    expect(regionsOfPage(analysis, 2).map((r) => r.id)).toEqual(['continuation']);
  });

  it('returns nothing rather than throwing on a document with no regions', () => {
    expect(regionsOfPage({}, 1)).toEqual([]);
    expect(regionsOfPage(null, 1)).toEqual([]);
  });
});
