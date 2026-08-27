/**
 * scripts/lib/reference-metrics.mjs — the arithmetic a create run should not
 * have to write down.
 *
 * ## Why this exists
 *
 * A create run measuring a reference against its render spent **76 ad-hoc
 * Python scripts and 27.2 minutes of model time** — 35% of the whole run — to
 * produce 4.7 minutes of actual computation. Rule detection, colour sampling,
 * image dimensions, text-band extents: every one of them composed from scratch,
 * run once, and thrown away. Rendering, the operation that felt expensive, cost
 * 0.6 minutes across the same run.
 *
 * None of that is judgement. Where a rule sits, how tall a band is, which
 * colours a region uses — these have one right answer that a function can
 * produce. What the run should be spending its reasoning on is what those
 * numbers *mean*: which region owns a divider, whether two rules are one grid
 * drawn twice, which primitive expresses the arrangement. That stays with the
 * model. This file only removes the arithmetic under it.
 *
 * ## Reference pixel units
 *
 * A reference and its render are almost never the same size — in the run this
 * came from, 1103x1426 against 1240x1603. The scale factor between them was
 * recomputed inside nearly every one of those 76 scripts, and a comparison in
 * mixed units is worse than no comparison because it looks like an answer.
 *
 * So: {@link comparableBands} takes its windows in **reference** pixels and
 * returns both sides in **reference** pixels, whatever the render's raster
 * actually is. Single-image functions work in that image's own pixels, because
 * there is nothing to reconcile.
 *
 * ## Decoded PNGs in, plain data out
 *
 * Every function here takes an already-decoded `{width, height, data}` — the
 * same contract `border-topology.mjs` uses — and returns JSON-serialisable
 * values. Decoding belongs to the caller, which is what lets the tests run off
 * synthesised rasters with no files on disk, and what keeps `pngjs` out of a
 * root script that has no dependencies of its own.
 */

import { isDark } from "./border-topology.mjs";

/** Ink coverage below this share of a scan line is noise, not a band. */
const BAND_NOISE_FLOOR = 0;

/**
 * The page's own numbers: how big it is, and where its content actually starts.
 *
 * Margins are measured from ink, not assumed from a template. A reference
 * cropped tight and a reference with white space around it are the same
 * document, and only the ink says which one you have.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} png
 * @returns {{width:number,height:number,aspect:number,margins:{top:number,right:number,bottom:number,left:number},inkBounds:{x0:number,y0:number,x1:number,y1:number}|null}}
 */
export function pageMetrics(png) {
  const { width, height } = png;
  const bounds = inkBounds(png, { x0: 0, y0: 0, x1: width, y1: height });
  return {
    width,
    height,
    aspect: round(width / height, 4),
    margins: bounds
      ? {
          top: bounds.y0,
          right: width - bounds.x1,
          bottom: height - bounds.y1,
          left: bounds.x0,
        }
      : { top: 0, right: 0, bottom: 0, left: 0 },
    inkBounds: bounds,
  };
}

/**
 * The tightest box containing ink inside a window, or null when the window is blank.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} png
 * @param {{x0:number,y0:number,x1:number,y1:number}} window in this image's pixels
 */
export function inkBounds(png, window) {
  const { x0, y0, x1, y1 } = clampWindow(png, window);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y0; y < y1; y += 1) {
    const row = y * png.width;
    for (let x = x0; x < x1; x += 1) {
      if (!isDark(png.data, (row + x) * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  // Exclusive on the far edge, so width is x1 - x0 with no off-by-one at the
  // call site — the convention the window arguments already use.
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

/**
 * Maximal runs of rows carrying ink inside a column window — the lines of a
 * text block, the bands of a layout, whatever the window is looking at.
 *
 * This is the operation the audited run rebuilt by hand and eventually factored
 * into a scratch `compare.py`: a column window, ink runs down it, and each run's
 * horizontal extent. The window matters as much as the algorithm. Scanning a
 * whole page merges a heading with the rule under it and a two-column body into
 * one run per line; scanning one column separates them. Choosing the window is
 * the judgement, and it stays with the caller.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} png
 * @param {{x0:number,y0:number,x1:number,y1:number}} window in this image's pixels
 * @param {{minInk?:number,gap?:number}} [options] `minInk` dark pixels per row to
 *   count as inked; `gap` blank rows tolerated inside one run, for a face whose
 *   descenders leave a clean row mid-line
 * @returns {Array<{y0:number,y1:number,x0:number,x1:number,height:number}>}
 */
export function inkBands(png, window, options = {}) {
  const minInk = options.minInk ?? BAND_NOISE_FLOOR;
  const gap = options.gap ?? 0;
  const box = clampWindow(png, window);

  const inked = [];
  for (let y = box.y0; y < box.y1; y += 1) {
    const row = y * png.width;
    let count = 0;
    for (let x = box.x0; x < box.x1; x += 1) {
      if (isDark(png.data, (row + x) * 4)) count += 1;
    }
    inked.push(count > minInk);
  }

  const runs = [];
  let start = -1;
  let blank = 0;
  for (let i = 0; i < inked.length; i += 1) {
    if (inked[i]) {
      if (start === -1) start = i;
      blank = 0;
    } else if (start !== -1) {
      blank += 1;
      // Only close the run once the blank stretch is wider than the tolerance,
      // and close it at where the ink actually stopped rather than here.
      if (blank > gap) {
        runs.push([start, i - blank]);
        start = -1;
        blank = 0;
      }
    }
  }
  if (start !== -1) runs.push([start, inked.length - 1 - blank]);

  return runs.map(([a, b]) => {
    const y0 = box.y0 + a;
    const y1 = box.y0 + b + 1;
    const extent = inkBounds(png, { x0: box.x0, y0, x1: box.x1, y1 });
    return {
      y0,
      y1,
      height: y1 - y0,
      x0: extent ? extent.x0 : box.x0,
      x1: extent ? extent.x1 : box.x0,
    };
  });
}

/**
 * The colours a region actually uses, by coverage.
 *
 * Quantised before counting, because anti-aliasing turns one teal rule into
 * several hundred near-identical teals and an exact histogram reports the noise
 * rather than the design. The bucket size is the knob: coarse enough to collapse
 * a gradient's neighbours, fine enough to keep two brand colours apart.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} png
 * @param {{x0:number,y0:number,x1:number,y1:number}} [window] defaults to the whole image
 * @param {{max?:number,bucket?:number,minShare?:number}} [options]
 * @returns {Array<{hex:string,rgb:[number,number,number],share:number,pixels:number}>}
 */
export function samplePalette(png, window, options = {}) {
  const max = options.max ?? 8;
  const bucket = options.bucket ?? 16;
  const minShare = options.minShare ?? 0.002;
  const box = clampWindow(png, window ?? { x0: 0, y0: 0, x1: png.width, y1: png.height });

  const counts = new Map();
  let total = 0;
  for (let y = box.y0; y < box.y1; y += 1) {
    const row = y * png.width;
    for (let x = box.x0; x < box.x1; x += 1) {
      const i = (row + x) * 4;
      if (png.data[i + 3] <= 40) continue; // transparent is not a colour here
      const key =
        (quantise(png.data[i], bucket) << 16)
        | (quantise(png.data[i + 1], bucket) << 8)
        | quantise(png.data[i + 2], bucket);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return [];

  return mergeNeighbours([...counts.entries()], bucket)
    .slice(0, max)
    .map(([rgb, pixels]) => ({
      hex: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      rgb,
      share: round(pixels / total, 4),
      pixels,
    }))
    .filter((entry) => entry.share >= minShare);
}

/**
 * Fold buckets that are neighbours into their heaviest member.
 *
 * Grid quantisation alone does not do what this function promises. A bucket has
 * edges, and anti-aliased neighbours straddle them: teal `#066470` and its
 * one-step-lighter fringe `#086672` differ by two in red, and land in different
 * buckets because 6 and 8 sit either side of a boundary. The histogram then
 * reports one rule as two colours, which is exactly the noise the quantiser was
 * added to remove.
 *
 * Merging by distance instead of by grid has no edges to straddle. Heaviest
 * first, so the surviving entry is the one the design actually uses and the
 * fringe is absorbed into it rather than the other way round.
 *
 * @param {Array<[number, number]>} entries packed-RGB key and pixel count
 * @param {number} radius per-channel distance treated as the same colour
 * @returns {Array<[[number,number,number], number]>} sorted by coverage
 */
function mergeNeighbours(entries, radius) {
  const sorted = entries
    .map(([key, pixels]) => [[(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff], pixels])
    .sort((a, b) => b[1] - a[1]);

  const kept = [];
  for (const [rgb, pixels] of sorted) {
    const near = kept.find(
      (entry) => entry[0].every((channel, i) => Math.abs(channel - rgb[i]) <= radius),
    );
    if (near) near[1] += pixels;
    else kept.push([rgb, pixels]);
  }
  // Absorbing can reorder: a light entry that swallowed several fringes may now
  // outweigh one that swallowed none.
  return kept.sort((a, b) => b[1] - a[1]);
}

/**
 * The same named windows read off a reference and a render, both reported in
 * **reference** pixels.
 *
 * This is the whole point of the module. The audited run's only user-visible
 * regression came from correcting a *delta* between two elements without knowing
 * which of them owned it — and before it could even get that wrong, it had to
 * reconcile two rasters of different sizes by hand, in every script, every time.
 * Here the reconciliation happens once and is stated in the output, so a number
 * read from either side means the same thing.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} referencePng
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} renderPng
 * @param {Array<{name:string,x0:number,y0:number,x1:number,y1:number}>} windows
 *   in reference pixels
 * @param {{minInk?:number,gap?:number}} [options] passed through to {@link inkBands}
 */
export function comparableBands(referencePng, renderPng, windows, options = {}) {
  // One scale, from width. Using each axis separately would silently absorb an
  // aspect mismatch that the caller needs to be told about instead.
  const scale = renderPng.width / referencePng.width;
  const aspectDrift = round(
    renderPng.height / renderPng.width - referencePng.height / referencePng.width,
    4,
  );

  return {
    units: "reference pixels",
    referenceSize: { width: referencePng.width, height: referencePng.height },
    renderSize: { width: renderPng.width, height: renderPng.height },
    scale: round(scale, 6),
    aspectDrift,
    windows: windows.map((w) => {
      const reference = inkBands(referencePng, w, options);
      const render = inkBands(
        renderPng,
        { x0: w.x0 * scale, y0: w.y0 * scale, x1: w.x1 * scale, y1: w.y1 * scale },
        options,
      ).map((band) => ({
        y0: round(band.y0 / scale, 1),
        y1: round(band.y1 / scale, 1),
        height: round(band.height / scale, 1),
        x0: round(band.x0 / scale, 1),
        x1: round(band.x1 / scale, 1),
      }));
      return {
        name: w.name,
        window: { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 },
        reference: reference.map((band) => ({
          y0: round(band.y0, 1),
          y1: round(band.y1, 1),
          height: round(band.height, 1),
          x0: round(band.x0, 1),
          x1: round(band.x1, 1),
        })),
        render,
        // Stated, not implied. A caller comparing lists of different lengths is
        // comparing different things, and should see that before the numbers.
        bandCountMatches: reference.length === render.length,
      };
    }),
  };
}

function clampWindow(png, window) {
  const x0 = Math.max(0, Math.floor(window?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(window?.y0 ?? 0));
  const x1 = Math.min(png.width, Math.ceil(window?.x1 ?? png.width));
  const y1 = Math.min(png.height, Math.ceil(window?.y1 ?? png.height));
  return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

const quantise = (value, bucket) => Math.min(255, Math.round(value / bucket) * bucket);

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
