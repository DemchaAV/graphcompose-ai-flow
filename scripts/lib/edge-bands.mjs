/**
 * scripts/lib/edge-bands.mjs — is the page furniture where the reference has it?
 *
 * ## Why
 *
 * Four of the sixteen audited invoices needed a revision the user asked for
 * in the same words: the page number sat too low. Each was a handful of grey
 * pixels on a page of two million, invisible to the page percentage and to a
 * region ranking, and each was approved before a person noticed. The same
 * shape of defect at the other edge — a masthead lower or higher than the
 * reference's — is what a pixel diff scores as anti-aliasing.
 *
 * Both are one subtraction once the two rasters are in one pixel space: the
 * lowest band of ink in the reference's bottom strip against the lowest in
 * the render's; the highest band in the top strip likewise. Bands are what
 * `reference-metrics.mjs` already measures for text; here they are read at
 * the page's edges, where the furniture lives.
 *
 * A finding names the edge and the direction. It does not say what the band
 * is — a footer, a page number, a rule — because it does not need to: the
 * reference has ink there and the render has it somewhere else.
 */

import { inkBands } from "./reference-metrics.mjs";

/** How much of the page's height each edge strip covers. */
export const EDGE_FRACTION = 0.2;
/** Below this, as a fraction of the page height, a band is where the reference has it. */
export const EDGE_TOLERANCE_FRACTION = 0.0075;
/** Bands thinner than this are anti-aliasing or a stray dot, not furniture. */
export const MIN_BAND_HEIGHT = 2;

/**
 * The outermost ink band in a strip.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} png
 * @param {"top"|"bottom"} edge
 */
export function edgeBand(png, edge, { fraction = EDGE_FRACTION } = {}) {
  const strip = Math.max(1, Math.round(png.height * fraction));
  const window =
    edge === "top"
      ? { x0: 0, x1: png.width, y0: 0, y1: strip }
      : { x0: 0, x1: png.width, y0: png.height - strip, y1: png.height };
  const bands = inkBands(png, window, { gap: 1 }).filter((b) => b.y1 - b.y0 >= MIN_BAND_HEIGHT);
  if (bands.length === 0) return null;
  const band = edge === "top" ? bands[0] : bands[bands.length - 1];
  return { y0: band.y0, y1: band.y1, x0: band.x0, x1: band.x1, height: band.y1 - band.y0 };
}

/**
 * Compare the furniture at both edges.
 *
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} reference scaled to the render's size
 * @param {{width:number,height:number,data:Buffer|Uint8Array}} render
 * @returns {{ sameSpace:boolean, tolerancePx:number, top:object, bottom:object, defects:Array<object> }}
 */
export function compareEdgeBands(reference, render, { tolerance = EDGE_TOLERANCE_FRACTION } = {}) {
  const sameSpace = reference.width === render.width && reference.height === render.height;
  const tolerancePx = Math.max(2, Math.round(render.height * tolerance));
  const result = { sameSpace, tolerancePx, top: null, bottom: null, defects: [] };
  if (!sameSpace) return result;

  for (const edge of ["top", "bottom"]) {
    const ref = edgeBand(reference, edge);
    const out = edgeBand(render, edge);
    // The edge a reader anchors on: the top of a masthead, the bottom of a footer.
    const anchor = edge === "top" ? "y0" : "y1";
    const entry = {
      reference: ref,
      render: out,
      delta: ref && out ? out[anchor] - ref[anchor] : null,
      defect: null,
    };
    if (ref && !out) {
      entry.defect = {
        id: `${edge}-band-missing`,
        detail: `the reference carries ink in the ${edge} ${Math.round(EDGE_FRACTION * 100)}% of the page (rows ${ref.y0}–${ref.y1}) and the render carries none there`,
      };
    } else if (ref && out && Math.abs(entry.delta) > tolerancePx) {
      const direction = entry.delta > 0 ? "lower" : "higher";
      entry.defect = {
        id: `${edge}-band-${direction}`,
        detail:
          `the ${edge === "top" ? "highest" : "lowest"} band of ink sits ${Math.abs(entry.delta)}px ${direction} in the render ` +
          `than in the reference (${edge === "top" ? "top" : "bottom"} edge at ${out[anchor]} vs ${ref[anchor]}; tolerance ${tolerancePx}px). ` +
          (edge === "bottom"
            ? "On an invoice this is usually the page number or the footer: fix the bottom margin or the footer zone, not the body"
            : "This is usually the masthead or the top margin"),
      };
    }
    result[edge] = entry;
    if (entry.defect) result.defects.push(entry.defect);
  }
  return result;
}
