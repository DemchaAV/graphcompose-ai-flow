/**
 * scripts/lib/border-topology.mjs — the rules a page actually draws.
 *
 * A table's row count and its border structure are different things, and the
 * review has been conflating them. A reference that groups two adjacent rows
 * draws no line between them on purpose; a render that draws one there has not
 * "matched the row count better", it has broken the grouping. And the reverse —
 * a divider the reference has and the render lost — reads in a pixel diff as a
 * few hundred grey pixels among thousands, which is to say as nothing.
 *
 * So rules are extracted from both images and compared as a topology: how many,
 * where, how long. What that turns into is the distinction the reviewer needs —
 * a line missing from BOTH is intentional, a line missing from one is a defect,
 * and which one it is missing from says which kind.
 */

/** A raster row/column counts as part of a rule when its ink spans this much of the scan. */
const SPAN = 0.55;
/** Rules within this share of the image's size are the same rule. */
const TOLERANCE = 0.006;
/**
 * A rule is a line. Anything thicker than this share of the image is a fill -
 * a header band, a zebra row, a full-bleed masthead - and reporting it as a
 * rule is how a sage band with a curved edge came back as five missing
 * dividers. Filled areas are still returned, separately, because "the render
 * lost a band" is worth knowing and is not the same finding.
 */
const MAX_RULE_THICKNESS = 0.005;
/** Beyond tolerance but within this multiple of it, a rule moved rather than vanished. */
const DISPLACEMENT_FACTOR = 4;

const isDark = (data, index) => data[index] + data[index + 1] + data[index + 2] < 600 && data[index + 3] > 40;

/**
 * Collapse consecutive ink-bearing scan positions into rules.
 *
 * A 1 pt rule at 150 dpi is two or three raster rows; reporting each as its own
 * rule would make thickness look like count.
 */
function collapse(hits, positions, span) {
  const runs = [];
  let start = -1;
  const close = (end) => {
    runs.push({
      at: positions[start],
      thickness: end - start,
      extent: Math.max(...hits.slice(start, end)),
    });
  };
  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i] > 0 && start === -1) start = i;
    else if (hits[i] === 0 && start !== -1) {
      close(i);
      start = -1;
    }
  }
  if (start !== -1) close(hits.length);

  const limit = Math.max(2, span * MAX_RULE_THICKNESS);
  return {
    rules: runs.filter((run) => run.thickness <= limit),
    bands: runs.filter((run) => run.thickness > limit),
  };
}

/**
 * Horizontal and vertical rules inside a region of a decoded PNG.
 *
 * @param {{width:number,height:number,data:Buffer}} png
 * @param {{x:number,y:number,w:number,h:number}} [bounds] page fractions; whole image when absent
 * @returns {{horizontal: Array, vertical: Array, region: object}}
 */
export function extractRules(png, bounds) {
  const x0 = Math.max(0, Math.round((bounds?.x ?? 0) * png.width));
  const y0 = Math.max(0, Math.round((bounds?.y ?? 0) * png.height));
  const x1 = Math.min(png.width, Math.round(((bounds?.x ?? 0) + (bounds?.w ?? 1)) * png.width));
  const y1 = Math.min(png.height, Math.round(((bounds?.y ?? 0) + (bounds?.h ?? 1)) * png.height));
  const regionW = Math.max(1, x1 - x0);
  const regionH = Math.max(1, y1 - y0);

  const rowInk = [];
  const rowPos = [];
  for (let y = y0; y < y1; y += 1) {
    let ink = 0;
    for (let x = x0; x < x1; x += 1) {
      if (isDark(png.data, (y * png.width + x) * 4)) ink += 1;
    }
    // Normalised to the image, not the region, so two images of the same page
    // compare on one scale whatever region was asked for.
    rowInk.push(ink >= regionW * SPAN ? ink / regionW : 0);
    rowPos.push(y / png.height);
  }

  const colInk = [];
  const colPos = [];
  for (let x = x0; x < x1; x += 1) {
    let ink = 0;
    for (let y = y0; y < y1; y += 1) {
      if (isDark(png.data, (y * png.width + x) * 4)) ink += 1;
    }
    colInk.push(ink >= regionH * SPAN ? ink / regionH : 0);
    colPos.push(x / png.width);
  }

  const horizontal = collapse(rowInk, rowPos, png.height);
  const vertical = collapse(colInk, colPos, png.width);
  return {
    region: { x: x0 / png.width, y: y0 / png.height, w: regionW / png.width, h: regionH / png.height },
    horizontal: horizontal.rules,
    vertical: vertical.rules,
    horizontalBands: horizontal.bands,
    verticalBands: vertical.bands,
  };
}

/**
 * Compare two topologies.
 *
 * Rules are matched by position, so the answer survives a thickness or an
 * antialiasing difference. What it reports is the asymmetry: what one has and
 * the other does not, in both directions, because the two mean opposite things.
 */
export function compareRules(referenceRules, renderRules, tolerance = TOLERANCE) {
  const takenByRender = new Set();
  const matched = [];
  const displaced = [];
  const missingInRender = [];

  // A rule slightly out of tolerance is the same rule in the wrong place, not a
  // lost one and a spurious one. Reporting it as both is two findings with two
  // wrong fixes; reporting it as displaced is one finding with the right one.
  const displacedLimit = tolerance * DISPLACEMENT_FACTOR;

  for (const wanted of referenceRules) {
    let best = -1;
    let bestGap = Infinity;
    renderRules.forEach((drawn, i) => {
      if (takenByRender.has(i)) return;
      const gap = Math.abs(drawn.at - wanted.at);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    if (best !== -1 && bestGap <= tolerance) {
      takenByRender.add(best);
      matched.push({ at: wanted.at, drift: renderRules[best].at - wanted.at });
    } else if (best !== -1 && bestGap <= displacedLimit) {
      takenByRender.add(best);
      displaced.push({ at: wanted.at, drawnAt: renderRules[best].at, drift: renderRules[best].at - wanted.at });
    } else {
      missingInRender.push(wanted);
    }
  }

  const extraInRender = renderRules.filter((_, i) => !takenByRender.has(i));
  return { matched, displaced, missingInRender, extraInRender };
}

/**
 * The reading a reviewer needs, in one sentence per finding.
 *
 * The wording is the point. "A rule the reference draws and the render does not"
 * and "a rule the render draws and the reference does not" are opposite defects
 * with opposite fixes, and calling both "border mismatch" is how a grouping gets
 * un-grouped in the name of matching.
 */
export function describe(axis, comparison) {
  const findings = [];
  for (const rule of comparison.displaced ?? []) {
    findings.push({
      kind: "rule-displaced",
      axis,
      at: Number(rule.at.toFixed(4)),
      detail:
        `a ${axis} rule the reference puts at ${(rule.at * 100).toFixed(1)}% is drawn at ` +
        `${(rule.drawnAt * 100).toFixed(1)}% — the same rule, ${(Math.abs(rule.drift) * 100).toFixed(1)}% out of place`,
    });
  }
  for (const rule of comparison.missingInRender) {
    findings.push({
      kind: "rule-missing-from-render",
      axis,
      at: Number(rule.at.toFixed(4)),
      detail:
        `the reference draws a ${axis} rule at ${(rule.at * 100).toFixed(1)}% and the render does not — ` +
        `a divider was lost, not suppressed`,
    });
  }
  for (const rule of comparison.extraInRender) {
    findings.push({
      kind: "rule-only-in-render",
      axis,
      at: Number(rule.at.toFixed(4)),
      detail:
        `the render draws a ${axis} rule at ${(rule.at * 100).toFixed(1)}% and the reference does not — ` +
        `if the reference groups content there, this line is what breaks the grouping`,
    });
  }
  return findings;
}
