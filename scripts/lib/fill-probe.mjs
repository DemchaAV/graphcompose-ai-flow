/**
 * scripts/lib/fill-probe.mjs — does this container actually have a fill?
 *
 * ## Why a script decides this and not the analyser
 *
 * A run measured a container's shape (`rounded-rectangle`, not the previous
 * release's "capsule"), its radius (0.12 against a true 0.09), its width
 * (`fill-parent`, correct) and its repeat count (10, correct) — and answered
 * `fill.present: true` for a container that has no fill at all. The peach
 * sidebar shows straight through it; only a coral hairline marks its edge.
 * That one wrong field was the first thing a reader noticed about the render.
 *
 * The contract asked the right question. The model could not answer it from the
 * image. But nobody has to: sample the pixels inside the container and the
 * pixels just outside it, and if they are the same colour there is no fill.
 * That is arithmetic, and it belongs in a script.
 *
 * ## Modal colour, not average
 *
 * A container holds text and icons, so the mean of its interior is a colour
 * that appears nowhere in it. The most common colour is the fill — the ground
 * is almost always the largest area, even in a busy box. Sampling both sides
 * the same way makes the comparison fair.
 *
 * The border is excluded by insetting the interior sample; the exterior sample
 * is taken as a ring beyond the border, for the same reason.
 *
 * Every function takes an already-decoded `{width, height, data}`, the contract
 * `border-topology.mjs` and `reference-metrics.mjs` use: decoding belongs to
 * the caller, which keeps `pngjs` out of a script with no dependencies and lets
 * the tests run off synthesised rasters with no files on disk.
 */

/** Colours closer than this in each channel are the same colour to an eye. */
const SAME_COLOUR = 6;

/** How far inside the container's edge the interior sample starts, as a share of the shorter side. */
const BORDER_INSET = 0.18;

/** How far beyond the edge the exterior ring is taken, in pixels. */
const OUTSIDE_GAP = 3;
const OUTSIDE_BAND = 6;

function at(raster, x, y) {
  const i = (raster.width * y + x) * 4;
  return [raster.data[i], raster.data[i + 1], raster.data[i + 2]];
}

/** Quantised key, so anti-aliasing noise does not split one colour into fifty. */
function bucket([r, g, b]) {
  return `${r >> 2},${g >> 2},${b >> 2}`;
}

/**
 * The most common colour among the sampled points, as [r,g,b], or null when
 * nothing could be sampled.
 *
 * @param {{width:number,height:number,data:Uint8Array}} raster
 * @param {Array<[number,number]>} points
 */
export function modalColour(raster, points) {
  const seen = new Map();
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) continue;
    const rgb = at(raster, x, y);
    const key = bucket(rgb);
    const hit = seen.get(key);
    if (hit) hit.n += 1;
    else seen.set(key, { n: 1, rgb });
  }
  let best = null;
  for (const hit of seen.values()) if (!best || hit.n > best.n) best = hit;
  return best ? best.rgb : null;
}

/** Are two colours the same to an eye? */
export function sameColour(a, b) {
  if (!a || !b) return false;
  return a.every((v, i) => Math.abs(v - b[i]) <= SAME_COLOUR);
}

/** Fractional page bounds -> integer pixel rect on this raster. */
function toPixels(raster, bounds) {
  const x0 = Math.round(bounds.x * raster.width);
  const y0 = Math.round(bounds.y * raster.height);
  return {
    x0,
    y0,
    x1: Math.round((bounds.x + bounds.w) * raster.width),
    y1: Math.round((bounds.y + bounds.h) * raster.height),
  };
}

/**
 * Sample a container's interior and its surroundings.
 *
 * @param {{width:number,height:number,data:Uint8Array}} raster the reference page
 * @param {{x:number,y:number,w:number,h:number}} bounds fractions of the page
 * @returns {{measurable: boolean, inside: number[]|null, outside: number[]|null,
 *            filled: boolean|null, reason: string|null}}
 *          `filled` is null when the container is too small to sample honestly.
 */
export function probeFill(raster, bounds) {
  const { x0, y0, x1, y1 } = toPixels(raster, bounds);
  const w = x1 - x0;
  const h = y1 - y0;
  // Below this there is no interior left once the border is excluded, and a
  // guess from four pixels is worse than saying nothing.
  if (w < 8 || h < 8) {
    return { measurable: false, inside: null, outside: null, filled: null, reason: "container too small to sample" };
  }

  const inset = Math.max(2, Math.round(Math.min(w, h) * BORDER_INSET));
  const interior = [];
  const step = Math.max(1, Math.round(Math.min(w, h) / 24));
  for (let y = y0 + inset; y < y1 - inset; y += step) {
    for (let x = x0 + inset; x < x1 - inset; x += step) interior.push([x, y]);
  }

  // A ring beyond the border: left and right of the box on its own rows, which
  // stays inside the parent panel rather than wandering into the next column.
  const surround = [];
  for (let y = y0 + inset; y < y1 - inset; y += step) {
    for (let d = OUTSIDE_GAP; d < OUTSIDE_GAP + OUTSIDE_BAND; d += 1) {
      surround.push([x0 - d, y]);
      surround.push([x1 + d, y]);
    }
  }

  const inside = modalColour(raster, interior);
  const outside = modalColour(raster, surround);
  if (!inside || !outside) {
    return { measurable: false, inside, outside, filled: null, reason: "nothing to sample" };
  }
  return {
    measurable: true,
    inside,
    outside,
    // Same ground on both sides means the container paints nothing: what is
    // seen through it is what is behind it.
    filled: !sameColour(inside, outside),
    reason: null,
  };
}

/** `rgb(252,241,237)`, for a message a person has to act on. */
export function describeColour(rgb) {
  return rgb ? `rgb(${rgb.join(",")})` : "none";
}
