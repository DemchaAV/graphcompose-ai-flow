/**
 * Region masking for visual-diff.
 *
 * Reads a PNG, paints rectangular regions with a solid colour
 * (`mask-out` mode) or paints everything OUTSIDE the regions with
 * the solid colour (`keep-only` mode), and returns the modified PNG
 * buffer. Pure pngjs — no ImageMagick / Sharp dependency.
 *
 * Used by the Visual Review Agent when applying the region-aware
 * pixel-AE gate for `data-only` and `asset-only` revisions:
 *
 *   1. Run `mask-regions` against the parent PNG and the child PNG
 *      with the SAME region list. Masked-out regions become byte-
 *      identical in both outputs, so the subsequent diff focuses on
 *      whatever is left.
 *   2. Run the standard `visual-diff` against the two masked PNGs.
 *      In `mask-out` mode, the affected regions disappear and any
 *      non-zero diff must live in regions the user did NOT ask to
 *      change (= a leak). In `keep-only` mode, only the affected
 *      regions remain and the diff quantifies the intended change.
 *
 * Performance: scales with PNG pixel count and region count;
 * O(width × height × regions) in the worst case (per-pixel
 * inside-region check). For typical CV / invoice PNGs at 150 DPI
 * with ≤ 10 regions, masking completes in under 100 ms.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

export interface Region {
  /** Left edge of the region, in pixels from the PNG left. */
  x: number;
  /** Top edge of the region, in pixels from the PNG top. */
  y: number;
  /** Width of the region, in pixels. */
  w: number;
  /** Height of the region, in pixels. */
  h: number;
  /** Optional human-readable label (e.g. "Footer", "ContactLine"). */
  label?: string;
}

export type MaskMode = 'mask-out' | 'keep-only';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MaskOptions {
  mode: MaskMode;
  color: Rgba;
}

/**
 * Default mask colour: opaque white. Two reasons:
 *
 *  - In `mask-out` mode the regions become white in both parent and
 *    child PNGs, so `pixelmatch` reports zero pixels in the masked
 *    rectangles — the AE-elsewhere check stays meaningful.
 *  - In `keep-only` mode the surrounding canvas becomes white,
 *    matching the typical document background and keeping the
 *    cropped region visually meaningful in a debugging context.
 */
export const DEFAULT_MASK_COLOR: Rgba = { r: 255, g: 255, b: 255, a: 255 };

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const i = Math.trunc(value);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normaliseRegion(region: Region, width: number, height: number): Region {
  const x = clampInt(region.x, 0, width);
  const y = clampInt(region.y, 0, height);
  const right = clampInt(region.x + region.w, 0, width);
  const bottom = clampInt(region.y + region.h, 0, height);
  return {
    x,
    y,
    w: Math.max(0, right - x),
    h: Math.max(0, bottom - y),
    label: region.label,
  };
}

function pixelInsideAnyRegion(
  px: number,
  py: number,
  regions: Region[],
): boolean {
  for (const r of regions) {
    if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      return true;
    }
  }
  return false;
}

function setPixel(buf: Buffer, idx: number, c: Rgba): void {
  buf[idx] = c.r;
  buf[idx + 1] = c.g;
  buf[idx + 2] = c.b;
  buf[idx + 3] = c.a;
}

/**
 * Apply masking to an in-memory PNG.
 *
 * Returns a NEW PNG instance; the input is not modified. The
 * caller is responsible for writing the result via `PNG.pack()` or
 * by passing it back through {@link writeMaskedPng}.
 */
export function maskRegions(
  png: PNG,
  regions: Region[],
  options: MaskOptions,
): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);

  const normalised = regions
    .map((r) => normaliseRegion(r, png.width, png.height))
    .filter((r) => r.w > 0 && r.h > 0);

  const mode = options.mode;
  const color = options.color;

  if (mode === 'mask-out') {
    // Paint every pixel that lies inside ANY region.
    for (const r of normalised) {
      for (let py = r.y; py < r.y + r.h; py += 1) {
        let idx = (py * png.width + r.x) * 4;
        for (let px = r.x; px < r.x + r.w; px += 1) {
          setPixel(out.data, idx, color);
          idx += 4;
        }
      }
    }
    return out;
  }

  // keep-only: paint every pixel NOT inside any region.
  for (let py = 0; py < png.height; py += 1) {
    let idx = py * png.width * 4;
    for (let px = 0; px < png.width; px += 1) {
      if (!pixelInsideAnyRegion(px, py, normalised)) {
        setPixel(out.data, idx, color);
      }
      idx += 4;
    }
  }
  return out;
}

/**
 * Read a PNG from disk, apply masking, write the result. Convenience
 * wrapper around {@link maskRegions} used by the CLI.
 */
export async function maskPngFile(
  inputPath: string,
  outputPath: string,
  regions: Region[],
  options: MaskOptions,
): Promise<{ width: number; height: number; regions: Region[] }> {
  const buf = await readFile(inputPath);
  const png = PNG.sync.read(buf);
  const masked = maskRegions(png, regions, options);
  const encoded = PNG.sync.write(masked);
  await writeFile(outputPath, encoded);
  return { width: png.width, height: png.height, regions };
}

/**
 * Convenience: write a PNG instance back to disk.
 */
export async function writeMaskedPng(
  png: PNG,
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, PNG.sync.write(png));
}

/**
 * Parse a hex colour string into an Rgba record.
 *
 * Accepted shapes:
 *   - "#RGB"    → expanded to "#RRGGBB" with alpha = 255
 *   - "#RGBA"   → expanded to "#RRGGBBAA"
 *   - "#RRGGBB" → alpha = 255
 *   - "#RRGGBBAA"
 *   - bare word: "white" / "black" / "transparent"
 */
export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 255 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 255 };
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = s.startsWith('#') ? s.slice(1) : s;
  const expand = (h: string): string => {
    if (h.length === 3 || h.length === 4) {
      return h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    return h;
  };
  const full = expand(hex);
  if (!/^[0-9a-f]{6}$|^[0-9a-f]{8}$/.test(full)) {
    throw new Error(`invalid color: "${input}" — expected white|black|transparent|#RGB|#RGBA|#RRGGBB|#RRGGBBAA`);
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

/**
 * Parse a JSON string into a `Region[]`, validating shape.
 *
 * Accepts either:
 *   - a top-level array: [{x,y,w,h,label?}, ...]
 *   - an object with `regions` key: { regions: [...] }
 */
export function parseRegions(input: string): Region[] {
  const parsed: unknown = JSON.parse(input);
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { regions?: unknown[] }).regions)
      ? (parsed as { regions: unknown[] }).regions
      : (() => {
          throw new Error('regions JSON must be an array or { regions: [...] }');
        })();

  return arr.map((entry, i) => {
    const e = entry as { x?: unknown; y?: unknown; w?: unknown; h?: unknown; label?: unknown };
    const x = Number(e.x);
    const y = Number(e.y);
    const w = Number(e.w);
    const h = Number(e.h);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      throw new Error(`region #${i}: x, y, w, h must all be finite numbers`);
    }
    const label = typeof e.label === 'string' ? e.label : undefined;
    return { x, y, w, h, label };
  });
}
