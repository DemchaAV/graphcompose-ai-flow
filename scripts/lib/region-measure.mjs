/**
 * scripts/lib/region-measure.mjs — the reference side of a region, measured.
 *
 * ## Why
 *
 * `evidence.mjs` decides GEOMETRY by comparing the layout snapshot's owner box
 * — an engine measurement — against the region's `bounds` in
 * `visual-analysis.json`, which the model read off the image by eye, at a
 * tolerance of half a percent of the page (about 3 pt). Eyeballed bounds are
 * not accurate to 3 pt, so the corpus came back UNKNOWN for 125 of 147
 * packages: the deterministic half of the comparison was only ever the render.
 *
 * This measures the other half. Inside a padded window around the analysis
 * bounds it finds the tightest box of pixels that differ from the window's
 * background, on the reference and on the render, in the same pixel space
 * (`reference-scaled.png` has the render's dimensions). Two boxes in one space
 * subtract to a displacement — the region's ink sits `dx, dy` from where the
 * reference has it — with no node, no bounds and no judgement involved. A
 * normalised cross-correlation of the reference crop over the render confirms
 * the shift for regions whose ink box is not a good handle (a panel edge, a
 * rule, a texture).
 *
 * Nothing here decides a cause. It hands `evidence-package.mjs` a measured
 * reference rect and a measured shift, and the package says what follows.
 */

/** Per-channel distance below which a pixel counts as background. */
export const BACKGROUND_TOLERANCE = 48;
/** How far the search window extends past the analysis bounds, as a page fraction. */
export const DEFAULT_PAD = 0.02;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** A window in this image's pixels from fractional bounds plus padding. */
export function windowFor(png, bounds, pad = DEFAULT_PAD) {
  const x0 = clamp(Math.floor((bounds.x - pad) * png.width), 0, png.width);
  const y0 = clamp(Math.floor((bounds.y - pad) * png.height), 0, png.height);
  const x1 = clamp(Math.ceil((bounds.x + bounds.w + pad) * png.width), 0, png.width);
  const y1 = clamp(Math.ceil((bounds.y + bounds.h + pad) * png.height), 0, png.height);
  return { x0, y0, x1, y1 };
}

/**
 * The background of a window: the most common colour along its border,
 * quantised to 8 levels per channel so anti-aliasing does not split the vote.
 */
export function windowBackground(png, window) {
  const votes = new Map();
  const vote = (x, y) => {
    const i = (y * png.width + x) * 4;
    const key = `${png.data[i] >> 5},${png.data[i + 1] >> 5},${png.data[i + 2] >> 5}`;
    const entry = votes.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    entry.n += 1;
    entry.r += png.data[i];
    entry.g += png.data[i + 1];
    entry.b += png.data[i + 2];
    votes.set(key, entry);
  };
  const { x0, y0, x1, y1 } = window;
  if (x1 <= x0 || y1 <= y0) return { r: 255, g: 255, b: 255 };
  for (let x = x0; x < x1; x += 1) {
    vote(x, y0);
    vote(x, y1 - 1);
  }
  for (let y = y0; y < y1; y += 1) {
    vote(x0, y);
    vote(x1 - 1, y);
  }
  let best = null;
  for (const entry of votes.values()) if (!best || entry.n > best.n) best = entry;
  return best ? { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n } : { r: 255, g: 255, b: 255 };
}

/**
 * The tightest box of pixels that differ from the window's background.
 *
 * @returns {{x0:number,y0:number,x1:number,y1:number,pixels:number,fraction:number,background:{r:number,g:number,b:number}}|null}
 */
export function contrastBounds(png, window, tolerance = BACKGROUND_TOLERANCE) {
  const bg = windowBackground(png, window);
  const { x0, y0, x1, y1 } = window;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pixels = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * png.width;
    for (let x = x0; x < x1; x += 1) {
      const i = (row + x) * 4;
      const d = Math.abs(png.data[i] - bg.r) + Math.abs(png.data[i + 1] - bg.g) + Math.abs(png.data[i + 2] - bg.b);
      if (d <= tolerance) continue;
      pixels += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (pixels === 0) return null;
  const area = (x1 - x0) * (y1 - y0);
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1, pixels, fraction: area > 0 ? pixels / area : 0, background: bg };
}

/** Luminance of one pixel. */
function luma(data, i) {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** A grayscale, block-mean downsample of a window. */
function grayWindow(png, window, factor) {
  const w = Math.max(1, Math.floor((window.x1 - window.x0) / factor));
  const h = Math.max(1, Math.floor((window.y1 - window.y0) / factor));
  const out = new Float32Array(w * h);
  for (let by = 0; by < h; by += 1) {
    for (let bx = 0; bx < w; bx += 1) {
      let sum = 0;
      let n = 0;
      for (let y = window.y0 + by * factor; y < window.y0 + (by + 1) * factor && y < window.y1; y += 1) {
        for (let x = window.x0 + bx * factor; x < window.x0 + (bx + 1) * factor && x < window.x1; x += 1) {
          sum += luma(png.data, (y * png.width + x) * 4);
          n += 1;
        }
      }
      out[by * w + bx] = n ? sum / n : 0;
    }
  }
  return { width: w, height: h, data: out, factor };
}

/**
 * Where the reference crop sits in the render, by normalised cross-correlation.
 *
 * Brute force at a downsample, then refined by one step at full resolution
 * around the best coarse position. The search radius is a page fraction; a
 * region that has moved further than that is not "shifted", it is elsewhere.
 *
 * @returns {{dx:number, dy:number, score:number, radiusPx:number}|null} dx, dy in
 *   pixels (render minus reference: positive x means the render's copy sits to
 *   the right); score in [-1, 1]; null when the crop carries no structure
 */
export function correlateShift(referencePng, renderPng, bounds, { radius = 0.06, factor = 4 } = {}) {
  const crop = windowFor(referencePng, bounds, 0);
  if (crop.x1 - crop.x0 < factor * 2 || crop.y1 - crop.y0 < factor * 2) return null;
  const radiusPx = Math.max(factor, Math.round(radius * referencePng.width));
  const search = {
    x0: clamp(crop.x0 - radiusPx, 0, renderPng.width),
    y0: clamp(crop.y0 - radiusPx, 0, renderPng.height),
    x1: clamp(crop.x1 + radiusPx, 0, renderPng.width),
    y1: clamp(crop.y1 + radiusPx, 0, renderPng.height),
  };
  const t = grayWindow(referencePng, crop, factor);
  const s = grayWindow(renderPng, search, factor);
  if (s.width < t.width || s.height < t.height) return null;

  // Normalise the template once.
  let tMean = 0;
  for (const v of t.data) tMean += v;
  tMean /= t.data.length;
  let tVar = 0;
  for (const v of t.data) tVar += (v - tMean) ** 2;
  if (tVar < 1e-6) return null; // a flat crop correlates with everything

  const score = (ox, oy) => {
    let sMean = 0;
    for (let y = 0; y < t.height; y += 1) {
      for (let x = 0; x < t.width; x += 1) sMean += s.data[(oy + y) * s.width + (ox + x)];
    }
    sMean /= t.data.length;
    let num = 0;
    let sVar = 0;
    for (let y = 0; y < t.height; y += 1) {
      for (let x = 0; x < t.width; x += 1) {
        const a = t.data[y * t.width + x] - tMean;
        const b = s.data[(oy + y) * s.width + (ox + x)] - sMean;
        num += a * b;
        sVar += b * b;
      }
    }
    return sVar < 1e-6 ? 0 : num / Math.sqrt(tVar * sVar);
  };

  let best = { ox: 0, oy: 0, score: -Infinity };
  for (let oy = 0; oy + t.height <= s.height; oy += 1) {
    for (let ox = 0; ox + t.width <= s.width; ox += 1) {
      const v = score(ox, oy);
      if (v > best.score) best = { ox, oy, score: v };
    }
  }
  if (best.score === -Infinity) return null;
  // The coarse answer is quantised to `factor` pixels, against a tolerance of
  // a few points. Refine at full resolution in a one-cell neighbourhood of
  // the best coarse offset — the template is scored at every integer offset
  // within ±factor of it — so the shift is exact to the pixel.
  const coarseX = best.ox * factor + search.x0;
  const coarseY = best.oy * factor + search.y0;
  const full = refineShift(referencePng, renderPng, crop, coarseX, coarseY, factor);
  const dx = full.x - crop.x0;
  const dy = full.y - crop.y0;
  return { dx, dy, score: Math.round(full.score * 1000) / 1000, radiusPx };
}

/** NCC at full resolution over the offsets within ±radius of (x0, y0). */
function refineShift(referencePng, renderPng, crop, x0, y0, radius) {
  const w = crop.x1 - crop.x0;
  const h = crop.y1 - crop.y0;
  const t = new Float32Array(w * h);
  let tMean = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = luma(referencePng.data, ((crop.y0 + y) * referencePng.width + (crop.x0 + x)) * 4);
      t[y * w + x] = v;
      tMean += v;
    }
  }
  tMean /= t.length;
  let tVar = 0;
  for (let i = 0; i < t.length; i += 1) {
    t[i] -= tMean;
    tVar += t[i] * t[i];
  }
  let best = { x: x0, y: y0, score: -Infinity };
  if (tVar < 1e-6) return { x: x0, y: y0, score: 0 };
  for (let oy = y0 - radius; oy <= y0 + radius; oy += 1) {
    if (oy < 0 || oy + h > renderPng.height) continue;
    for (let ox = x0 - radius; ox <= x0 + radius; ox += 1) {
      if (ox < 0 || ox + w > renderPng.width) continue;
      let sMean = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) sMean += luma(renderPng.data, ((oy + y) * renderPng.width + (ox + x)) * 4);
      }
      sMean /= t.length;
      let num = 0;
      let sVar = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const b = luma(renderPng.data, ((oy + y) * renderPng.width + (ox + x)) * 4) - sMean;
          num += t[y * w + x] * b;
          sVar += b * b;
        }
      }
      const score = sVar < 1e-6 ? 0 : num / Math.sqrt(tVar * sVar);
      if (score > best.score) best = { x: ox, y: oy, score };
    }
  }
  return best.score === -Infinity ? { x: x0, y: y0, score: 0 } : best;
}

/**
 * Measure one region on both sides.
 *
 * @param {{width:number,height:number,data:Uint8Array|Buffer}} referencePng the reference, scaled to the render's size
 * @param {{width:number,height:number,data:Uint8Array|Buffer}} renderPng the render
 * @param {{x:number,y:number,w:number,h:number}} bounds the analysis bounds, as page fractions
 * @param {{pad?:number, correlate?:boolean}} [options]
 * @returns {object} px boxes and fractional boxes for both, the shift, and the correlation
 */
export function measureRegion(referencePng, renderPng, bounds, options = {}) {
  const sameSpace = referencePng.width === renderPng.width && referencePng.height === renderPng.height;
  // A box that touches the window's edge was clipped by it — either the ink
  // goes on past where the analysis thought the region ended, or a neighbour's
  // ink is inside the window. Widen once and look again; if it still touches,
  // report it clipped and let the caller prefer the correlation, which matches
  // the crop's pattern and does not care what surrounds it. Widening further
  // on a dense page only takes in more neighbours.
  const measureSide = (png) => {
    let pad = options.pad ?? DEFAULT_PAD;
    let box = null;
    let window = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      window = windowFor(png, bounds, pad);
      box = contrastBounds(png, window);
      if (!box) return { box: null, window, clipped: false };
      const touches =
        (box.x0 <= window.x0 && window.x0 > 0) ||
        (box.y0 <= window.y0 && window.y0 > 0) ||
        (box.x1 >= window.x1 && window.x1 < png.width) ||
        (box.y1 >= window.y1 && window.y1 < png.height);
      if (!touches) return { box, window, clipped: false };
      pad *= 2;
    }
    return { box, window, clipped: true };
  };
  const refSide = measureSide(referencePng);
  const outSide = measureSide(renderPng);
  const ref = refSide.box;
  const out = outSide.box;

  const toFractions = (png, box) =>
    box
      ? {
          x: round(box.x0 / png.width, 4),
          y: round(box.y0 / png.height, 4),
          w: round((box.x1 - box.x0) / png.width, 4),
          h: round((box.y1 - box.y0) / png.height, 4),
        }
      : null;

  const measured = {
    sameSpace,
    analysisBounds: bounds,
    reference: ref
      ? { px: { x0: ref.x0, y0: ref.y0, x1: ref.x1, y1: ref.y1 }, bounds: toFractions(referencePng, ref), inkFraction: round(ref.fraction, 4), clipped: refSide.clipped }
      : null,
    render: out
      ? { px: { x0: out.x0, y0: out.y0, x1: out.x1, y1: out.y1 }, bounds: toFractions(renderPng, out), inkFraction: round(out.fraction, 4), clipped: outSide.clipped }
      : null,
    shift: null,
    correlation: null,
  };

  if (sameSpace && ref && out) {
    measured.shift = {
      // Render minus reference, in the render's pixels: positive x means the
      // render's ink sits to the right of the reference's, positive y lower.
      dx: out.x0 - ref.x0,
      dy: out.y0 - ref.y0,
      dWidth: (out.x1 - out.x0) - (ref.x1 - ref.x0),
      dHeight: (out.y1 - out.y0) - (ref.y1 - ref.y0),
    };
  }
  if (sameSpace && options.correlate !== false) {
    measured.correlation = correlateShift(referencePng, renderPng, bounds);
  }
  return measured;
}

function round(value, places) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
