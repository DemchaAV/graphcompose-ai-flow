/**
 * scripts/lib/corner-probe.mjs — how round is each corner, measured one at a time?
 *
 * ## Why four numbers and not one
 *
 * One reference, two models, opposite errors. The identity panel in the CV has
 * three square corners and one strongly rounded bottom-right. Gemini recorded
 * `cornerRadiusRatio: 0` and rendered a rectangle; GPT recorded `0.18` and
 * rendered a lozenge. Neither was careless — the field is a single scalar, so a
 * shape with one rounded corner has no honest value to put in it, and each
 * model rounded toward a different one of the four.
 *
 * GPT actually saw it. Its analysis carries, in `notes`:
 *
 *     "Only the bottom-right corner is strongly rounded in the reference."
 *
 * The truth reached the artifact and stopped there, because `notes` is prose
 * and the author builds from the number. That is the same shape as the fill
 * defect this module sits beside: the contract asked a question the reference
 * can answer, in a form that could not carry the answer.
 *
 * ## The measurement
 *
 * Walk the inward diagonal from a corner. On a square corner the container's
 * ink starts at the corner itself; on a rounded one the arc has pulled away,
 * and for a quarter-circle of radius r the gap along the diagonal is
 *
 *     d = r · (1 − 1/√2) ≈ 0.293 · r
 *
 * so r ≈ 3.41 · d. That holds whether the container is filled or only stroked:
 * either way the diagonal crosses the boundary where the arc is.
 *
 * ## What it refuses
 *
 * Each corner is measured on its own and can decline on its own. A panel flush
 * against the page edge — which the identity panel is — has no outside to
 * sample past its top-left, and saying so beats inventing a radius from pixels
 * that are not there. The corner that matters in that panel is the bottom
 * right, and that one measures.
 *
 * Same contract as `fill-probe.mjs`: an already-decoded `{width, height, data}`
 * in, so the tests run off synthesised rasters with no files on disk, and the
 * colour primitives are shared rather than reimplemented a second way.
 */

import { modalColour, sameColour } from "./fill-probe.mjs";

/** The corners, in the order the schema names them. */
export const CORNERS = Object.freeze(["topLeft", "topRight", "bottomRight", "bottomLeft"]);

/** Geometry of a quarter-circle: the corner-to-arc gap along the diagonal. */
const DIAGONAL_SHARE = 1 - 1 / Math.SQRT2;

/** Below this the corner is a handful of pixels and any radius is noise. */
const MIN_SIDE = 16;

/** How far out the exterior sample sits, and how deep, in pixels. */
const OUTSIDE_GAP = 3;
const OUTSIDE_BAND = 5;

/**
 * How many of the three parallel rays must find the boundary.
 *
 * Confirmation runs across the rays and deliberately not along one of them: a
 * hairline stroke is a single pixel deep, so "two consecutive hits" — the first
 * thing this tried — measured filled containers and refused outlined ones,
 * which is the competency card and the whole reason the fill probe exists. A
 * stray pixel does not repeat at the same depth on the neighbouring ray; an
 * edge does.
 */
const CONFIRM_RAYS = 2;

/** Fractional page bounds -> integer pixel rect. Kept identical to fill-probe's. */
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

/** Where each corner sits, and which way is inward from it. */
function cornerGeometry(corner, { x0, y0, x1, y1 }) {
  switch (corner) {
    case "topLeft":
      return { x: x0, y: y0, dx: 1, dy: 1 };
    case "topRight":
      return { x: x1 - 1, y: y0, dx: -1, dy: 1 };
    case "bottomRight":
      return { x: x1 - 1, y: y1 - 1, dx: -1, dy: -1 };
    default:
      return { x: x0, y: y1 - 1, dx: 1, dy: -1 };
  }
}

function inBounds(raster, x, y) {
  return x >= 0 && y >= 0 && x < raster.width && y < raster.height;
}

function pixelAt(raster, x, y) {
  const i = (raster.width * y + x) * 4;
  return [raster.data[i], raster.data[i + 1], raster.data[i + 2]];
}

/**
 * Measure one corner.
 *
 * @returns {{measurable: boolean, radiusRatio: number|null, gapPx: number|null, reason: string|null}}
 */
function probeCorner(raster, rect, corner, shortSide) {
  const { x, y, dx, dy } = cornerGeometry(corner, rect);

  // Outside is sampled diagonally away from the corner, which stays clear of
  // both edges that meet there. Off the page it samples nothing, and a corner
  // with no outside is a corner this cannot measure.
  const surround = [];
  for (let d = OUTSIDE_GAP; d < OUTSIDE_GAP + OUTSIDE_BAND; d += 1) {
    surround.push([x - dx * d, y - dy * d]);
    surround.push([x - dx * d, y]);
    surround.push([x, y - dy * d]);
  }
  const usable = surround.filter(([px, py]) => inBounds(raster, px, py));
  if (usable.length < surround.length / 2) {
    return { measurable: false, radiusRatio: null, gapPx: null, reason: "corner sits on the page edge — nothing outside it to sample" };
  }
  const outside = modalColour(raster, usable);
  if (!outside) {
    return { measurable: false, radiusRatio: null, gapPx: null, reason: "nothing to sample outside the corner" };
  }

  // A radius cannot exceed half the shorter side, so neither can the search.
  const limit = Math.floor(shortSide / 2);
  // Three parallel diagonals: through the corner, and one step along each edge.
  const rays = [
    [0, 0],
    [dx, 0],
    [0, dy],
  ];

  const found = [];
  for (const [ox, oy] of rays) {
    for (let d = 0; d <= limit; d += 1) {
      const px = x + ox + dx * d;
      const py = y + oy + dy * d;
      if (!inBounds(raster, px, py)) break;
      if (sameColour(pixelAt(raster, px, py), outside)) continue;
      found.push(d);
      break;
    }
  }

  if (found.length < CONFIRM_RAYS) {
    // Walked half the container on every ray and never left the ground colour:
    // either it paints nothing, or it paints what surrounds it.
    return {
      measurable: false,
      radiusRatio: null,
      gapPx: null,
      reason: "the container never differs from its surroundings along this corner",
    };
  }

  // The median, so one ray clipped by content near the corner cannot carry it.
  found.sort((a, b) => a - b);
  const gapPx = found[Math.floor(found.length / 2)];
  return {
    measurable: true,
    radiusRatio: Math.min(0.5, Math.round((gapPx / DIAGONAL_SHARE / shortSide) * 1000) / 1000),
    gapPx,
    reason: null,
  };
}

/**
 * Measure all four corners of a container against the reference.
 *
 * @param {{width:number,height:number,data:Uint8Array}} raster the reference page
 * @param {{x:number,y:number,w:number,h:number}} bounds fractions of the page
 * @returns {{measurable: boolean, corners: object, reason: string|null}}
 */
export function probeCorners(raster, bounds) {
  const rect = toPixels(raster, bounds);
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  if (w < MIN_SIDE || h < MIN_SIDE) {
    return { measurable: false, corners: {}, reason: "container too small to measure a corner" };
  }

  const shortSide = Math.min(w, h);
  const corners = {};
  for (const corner of CORNERS) corners[corner] = probeCorner(raster, rect, corner, shortSide);
  return {
    measurable: CORNERS.some((c) => corners[c].measurable),
    corners,
    reason: null,
  };
}

/**
 * The claimed radius for one corner, whatever form the analysis wrote it in.
 *
 * A number is every corner; an object names them. Absent from an object means
 * square, which is what "only the bottom-right is rounded" has to be able to
 * say without writing three zeroes.
 */
export function claimedRadius(cornerRadiusRatio, corner) {
  if (typeof cornerRadiusRatio === "number") return cornerRadiusRatio;
  if (cornerRadiusRatio && typeof cornerRadiusRatio === "object") {
    const value = cornerRadiusRatio[corner];
    return typeof value === "number" ? value : 0;
  }
  return null;
}

/** Is this claim a single number rather than four? */
export function isUniform(cornerRadiusRatio) {
  return typeof cornerRadiusRatio === "number";
}
