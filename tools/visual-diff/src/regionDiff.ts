/**
 * Per-region pixel comparison.
 *
 * `config/pipeline.json` has declared a `region-diff` gate since Phase 1 —
 * "AE on the affected regions; every region outside that list must be
 * byte-equal" — and no script has ever implemented it. Grep the repository for
 * the string and the only hits are the config that names it and the schema
 * vocabulary that mirrors it. The gate was prose.
 *
 * The cost of that shows up on the OTHER gate. A whole-page percentage against
 * a rasterised design reference is a number nobody can act on: it is never
 * zero, it is dominated by glyph anti-aliasing, and so the only thing a
 * reviewer can do with it is explain it. In a real run 9.734% was explained,
 * correctly in outline — "it is type rendering, not geometry" — and inside that
 * explained number sat a timeline rail drawn straight through the marker that
 * was supposed to cap it. The user saw it in a screenshot in about a second.
 *
 * One number per region is a different instrument. It cannot be explained away
 * wholesale, because the regions disagree with each other: a page whose diff is
 * genuinely type rendering has it spread across every text region in roughly
 * even proportion, and a page with a structural defect has one region carrying
 * a share of the damage far above its share of the page.
 *
 * So this reports two figures per region, and the second is the one that
 * matters:
 *
 *   percent               mismatched pixels as a share of THIS region
 *   shareOfPageMismatch   this region's mismatched pixels as a share of the
 *                         whole page's, next to the share of the page's AREA
 *                         it occupies. Even wear puts those two close
 *                         together; a defect drives them apart.
 *
 * pngjs and pixelmatch, like the rest of this tool: no ImageMagick, so it runs
 * the same on a dev machine, in CI, and inside an installed harness.
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

import { classifyPercent, parityScore, type Classification } from './classify.js';
import type { FractionalBounds } from './cropRegion.js';
import { assertFractionalBounds } from './cropRegion.js';
import type { LoadedPng } from './diff.js';
import { scaleTo } from './scale.js';

/**
 * A region to measure, as it appears in visual-analysis.json.
 *
 * `bounds` is optional because the schema makes it optional — only `id`,
 * `label` and `role` are required there. A region without bounds cannot be
 * measured, and that fact has to travel: dropping it from the list would make
 * it indistinguishable from a region that matched.
 */
export interface RegionSpec {
  id: string;
  label?: string;
  role?: string;
  page?: number;
  bounds?: FractionalBounds;
}

/** What one region measured. */
export interface RegionDiffEntry {
  id: string;
  label?: string;
  role?: string;
  /** The rect actually compared, in the output image's pixels. */
  rect: { x: number; y: number; w: number; h: number };
  totalPx: number;
  mismatchPx: number;
  /** Mismatched pixels as a percentage of this region. */
  percent: number;
  /** This region's share of the page's total mismatched pixels, 0..100. */
  shareOfPageMismatch: number;
  /** This region's share of the page's area, 0..100. The comparison figure. */
  shareOfPageArea: number;
  /**
   * shareOfPageMismatch / shareOfPageArea. 1.0 is even wear. Above ~2 means
   * the region carries damage out of proportion to its size, which is what a
   * structural defect looks like and what uniform anti-aliasing does not.
   * Null when the page has no mismatched pixels at all.
   */
  concentration: number | null;
  classification: Classification;
  parityScore: number;
  /** Set when the region could not be measured, with the reason. */
  skipped?: string;
}

export interface RegionDiffResult {
  width: number;
  height: number;
  pageTotalPx: number;
  pageMismatchPx: number;
  pagePercent: number;
  threshold: number;
  includeAA: boolean;
  regions: RegionDiffEntry[];
  /** Regions ranked by concentration, worst first. The reading order. */
  ranked: string[];
}

export interface RegionDiffOptions {
  threshold?: number;
  includeAA?: boolean;
}

/** Project fractional bounds onto an image and clamp to at least one pixel. */
function rectOf(bounds: FractionalBounds, width: number, height: number) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(bounds.x * width)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(bounds.y * height)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((bounds.x + bounds.w) * width)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((bounds.y + bounds.h) * height)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Copy one rect out of a decoded image into a fresh RGBA buffer. */
function cut(image: LoadedPng, rect: { x: number; y: number; w: number; h: number }): Buffer {
  const out = Buffer.alloc(rect.w * rect.h * 4);
  for (let row = 0; row < rect.h; row += 1) {
    const from = ((rect.y + row) * image.width + rect.x) * 4;
    image.data.copy(out, row * rect.w * 4, from, from + rect.w * 4);
  }
  return out;
}

/**
 * Compare `output` against `reference` region by region.
 *
 * The reference is scaled to the output's dimensions first, exactly as the
 * whole-page diff does, so one fractional rect lands on the same content in
 * both images regardless of the resolution the reference arrived at.
 *
 * A region whose bounds are unusable is reported with `skipped` rather than
 * dropped: a region that silently vanishes from the list reads as a region
 * that matched.
 */
export function runRegionDiff(
  reference: LoadedPng,
  output: LoadedPng,
  regions: RegionSpec[],
  options: RegionDiffOptions = {},
): RegionDiffResult {
  const threshold = options.threshold ?? 0.1;
  const includeAA = options.includeAA ?? false;

  const scaled = scaleTo(reference, output.width, output.height);
  const pageTotalPx = output.width * output.height;

  // The page figure is measured here rather than taken from visual-diff-stats,
  // so the shares below always add up against the same comparison the regions
  // were cut from. Two files disagreeing about the denominator is exactly the
  // kind of drift these numbers exist to expose.
  const pageDiff = Buffer.alloc(pageTotalPx * 4);
  const pageMismatchPx = pixelmatch(
    scaled.data,
    output.data,
    pageDiff,
    output.width,
    output.height,
    { threshold, includeAA },
  );

  const entries: RegionDiffEntry[] = regions.map((region) => {
    const base = {
      id: region.id,
      ...(region.label ? { label: region.label } : {}),
      ...(region.role ? { role: region.role } : {}),
    };

    try {
      if (!region.bounds) {
        throw new Error(
          'no bounds recorded in visual-analysis.json, so this region cannot be measured',
        );
      }
      assertFractionalBounds(region.bounds);
    } catch (err) {
      return {
        ...base,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        totalPx: 0,
        mismatchPx: 0,
        percent: 0,
        shareOfPageMismatch: 0,
        shareOfPageArea: 0,
        concentration: null,
        classification: classifyPercent(0),
        parityScore: parityScore(0),
        skipped: (err as Error).message,
      };
    }

    const rect = rectOf(region.bounds, output.width, output.height);
    const totalPx = rect.w * rect.h;
    const diff = Buffer.alloc(totalPx * 4);
    const mismatchPx = pixelmatch(
      cut(scaled, rect),
      cut(output, rect),
      diff,
      rect.w,
      rect.h,
      { threshold, includeAA },
    );

    const percent = totalPx > 0 ? (mismatchPx / totalPx) * 100 : 0;
    const shareOfPageMismatch = pageMismatchPx > 0 ? (mismatchPx / pageMismatchPx) * 100 : 0;
    const shareOfPageArea = (totalPx / pageTotalPx) * 100;

    return {
      ...base,
      rect,
      totalPx,
      mismatchPx,
      percent,
      shareOfPageMismatch,
      shareOfPageArea,
      concentration:
        pageMismatchPx > 0 && shareOfPageArea > 0
          ? shareOfPageMismatch / shareOfPageArea
          : null,
      classification: classifyPercent(percent),
      parityScore: parityScore(percent),
    };
  });

  const ranked = entries
    .filter((e) => !e.skipped && e.concentration !== null)
    .slice()
    .sort((a, b) => (b.concentration as number) - (a.concentration as number))
    .map((e) => e.id);

  return {
    width: output.width,
    height: output.height,
    pageTotalPx,
    pageMismatchPx,
    pagePercent: (pageMismatchPx / pageTotalPx) * 100,
    threshold,
    includeAA,
    regions: entries,
    ranked,
  };
}

/**
 * Read the regions of one page out of a visual-analysis.json object.
 *
 * Regions carry a `page` only on multi-page analyses; a single-page one omits
 * it, and defaulting to page 1 there keeps both shapes working.
 */
export function regionsOfPage(analysis: unknown, page = 1): RegionSpec[] {
  const regions = (analysis as { regions?: unknown })?.regions;
  if (!Array.isArray(regions)) return [];
  // Selected on id and page ONLY. A region whose bounds are missing or
  // malformed stays on the list and is reported `skipped` by runRegionDiff:
  // filtering it out here would make an unmeasurable region look like a
  // region that matched, which is the failure this whole tool exists to
  // prevent — and it would also make its id unnameable in `--changed`.
  return regions
    .filter((r): r is RegionSpec => {
      const region = r as Partial<RegionSpec>;
      return typeof region?.id === 'string' && (region.page ?? 1) === page;
    })
    .map((r) => ({
      id: r.id,
      label: r.label,
      role: r.role,
      page: r.page ?? 1,
      bounds:
        typeof r.bounds === 'object' && r.bounds !== null ? (r.bounds as FractionalBounds) : undefined,
    }));
}

/** Decode a PNG buffer into the shape the diff functions take. */
export function decodePng(raw: Buffer): LoadedPng {
  const png = PNG.sync.read(raw);
  return { width: png.width, height: png.height, data: png.data };
}
