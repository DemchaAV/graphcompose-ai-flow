#!/usr/bin/env node
/**
 * scripts/test/corner-probe.test.mjs — one corner at a time, measured.
 *
 * The panel these come from has three square corners and one strongly rounded
 * bottom-right. Two models read the same reference and wrote opposite single
 * numbers for it — 0 and 0.18 — because a single number is all the field could
 * hold. One of them had already written the truth in `notes`, where nothing
 * reads it.
 *
 * Rasters are synthesised, so every expected radius here is a radius something
 * actually drew.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CORNERS, claimedRadius, isUniform, probeCorners } from "../lib/corner-probe.mjs";

const PEACH = [253, 241, 237];
const TEAL = [2, 50, 45];

/**
 * A page of `ground` with one rounded box painted on it.
 *
 * `radii` is per-corner in pixels; a missing corner is square. `stroke` paints
 * the outline only, which is the unfilled competency-card case.
 */
function page({ ground = PEACH, box, radii = {}, ink = TEAL, stroke = false, width = 200, height = 200 } = {}) {
  const data = new Uint8Array(width * height * 4);
  const put = (x, y, [r, g, b]) => {
    const i = (width * y + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, ground);

  const corner = (x, y) => {
    const left = x - box.x0;
    const right = box.x1 - 1 - x;
    const top = y - box.y0;
    const bottom = box.y1 - 1 - y;
    if (left <= right && top <= bottom) return { name: "topLeft", cx: left, cy: top };
    if (left > right && top <= bottom) return { name: "topRight", cx: right, cy: top };
    if (left > right) return { name: "bottomRight", cx: right, cy: bottom };
    return { name: "bottomLeft", cx: left, cy: bottom };
  };

  const inside = (x, y) => {
    const { name, cx, cy } = corner(x, y);
    const r = radii[name] ?? 0;
    if (r === 0 || cx >= r || cy >= r) return true;
    return Math.hypot(r - cx, r - cy) <= r;
  };

  for (let y = box.y0; y < box.y1; y += 1) {
    for (let x = box.x0; x < box.x1; x += 1) {
      if (!inside(x, y)) continue;
      if (!stroke) {
        put(x, y, ink);
        continue;
      }
      // Outline only: a pixel whose neighbour is outside the shape is an edge.
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside(x + dx, y + dy));
      if (edge) put(x, y, ink);
    }
  }
  return { width, height, data };
}

/** The box used throughout: x 40..160, y 40..140 of a 200×200 page, short side 100. */
const BOX = { x0: 40, y0: 40, x1: 160, y1: 140 };
const BOUNDS = { x: 40 / 200, y: 40 / 200, w: 120 / 200, h: 100 / 200 };

test("THE CASE: three square corners and one rounded are reported separately", () => {
  // The identity panel, and the shape no single number can express.
  const raster = page({ box: BOX, radii: { bottomRight: 30 } });
  const probe = probeCorners(raster, BOUNDS);

  assert.equal(probe.measurable, true);
  for (const corner of ["topLeft", "topRight", "bottomLeft"]) {
    assert.equal(probe.corners[corner].measurable, true, `${corner} was not measurable`);
    assert.ok(probe.corners[corner].radiusRatio < 0.05, `${corner} read ${probe.corners[corner].radiusRatio}`);
  }
  // 30px on a 100px short side is 0.3.
  assert.ok(
    Math.abs(probe.corners.bottomRight.radiusRatio - 0.3) < 0.06,
    `bottomRight read ${probe.corners.bottomRight.radiusRatio}, expected about 0.3`,
  );
});

test("a uniform radius reads the same on all four corners", () => {
  const raster = page({ box: BOX, radii: { topLeft: 20, topRight: 20, bottomRight: 20, bottomLeft: 20 } });
  const probe = probeCorners(raster, BOUNDS);

  for (const corner of CORNERS) {
    assert.ok(
      Math.abs(probe.corners[corner].radiusRatio - 0.2) < 0.06,
      `${corner} read ${probe.corners[corner].radiusRatio}, expected about 0.2`,
    );
  }
});

test("a square box reads as square, not as a small radius", () => {
  const probe = probeCorners(page({ box: BOX }), BOUNDS);
  for (const corner of CORNERS) assert.ok(probe.corners[corner].radiusRatio < 0.03, `${corner} read ${probe.corners[corner].radiusRatio}`);
});

test("an outlined container measures the same as a filled one", () => {
  // The competency card: no fill, a hairline border. The diagonal crosses the
  // boundary either way, so the radius does not depend on the fill.
  const filled = probeCorners(page({ box: BOX, radii: { topLeft: 25 } }), BOUNDS);
  const outlined = probeCorners(page({ box: BOX, radii: { topLeft: 25 }, stroke: true }), BOUNDS);

  assert.ok(
    Math.abs(filled.corners.topLeft.radiusRatio - outlined.corners.topLeft.radiusRatio) < 0.05,
    `filled ${filled.corners.topLeft.radiusRatio} vs outlined ${outlined.corners.topLeft.radiusRatio}`,
  );
});

test("a corner on the page edge declines instead of inventing a radius", () => {
  // The identity panel really is flush with two page edges, so this is the
  // panel's own situation and not a contrived one.
  const flush = { x0: 0, y0: 0, x1: 120, y1: 100 };
  const probe = probeCorners(page({ box: flush, radii: { bottomRight: 30 } }), { x: 0, y: 0, w: 120 / 200, h: 100 / 200 });

  assert.equal(probe.corners.topLeft.measurable, false);
  assert.match(probe.corners.topLeft.reason, /page edge/);
  // The corner that carries the design still measures, which is the point of
  // deciding this per corner rather than per container.
  assert.equal(probe.corners.bottomRight.measurable, true);
  assert.ok(Math.abs(probe.corners.bottomRight.radiusRatio - 0.3) < 0.06);
});

test("a container that paints nothing is refused, not read as square", () => {
  const probe = probeCorners(page({ box: BOX, ink: PEACH }), BOUNDS);

  assert.equal(probe.measurable, false);
  for (const corner of CORNERS) {
    assert.equal(probe.corners[corner].measurable, false);
    assert.match(probe.corners[corner].reason, /never differs from its surroundings/);
  }
});

test("a container too small to hold a corner says so", () => {
  const probe = probeCorners(page({ box: { x0: 40, y0: 40, x1: 50, y1: 50 } }), { x: 0.2, y: 0.2, w: 0.05, h: 0.05 });

  assert.equal(probe.measurable, false);
  assert.match(probe.reason, /too small/);
});

test("the radius is capped where a capsule is, not extrapolated past it", () => {
  // Half the short side is a capsule; nothing can be rounder, and the schema
  // stops at 0.5 for the same reason.
  const raster = page({ box: BOX, radii: { topLeft: 50, topRight: 50, bottomRight: 50, bottomLeft: 50 } });
  const probe = probeCorners(raster, BOUNDS);

  for (const corner of CORNERS) assert.ok(probe.corners[corner].radiusRatio <= 0.5, `${corner} exceeded a capsule`);
});

test("claimedRadius reads a number as every corner and an object as each", () => {
  assert.equal(claimedRadius(0.12, "topLeft"), 0.12);
  assert.equal(claimedRadius(0.12, "bottomRight"), 0.12);

  const perCorner = { bottomRight: 0.3 };
  assert.equal(claimedRadius(perCorner, "bottomRight"), 0.3);
  // Absent means square: "only the bottom-right is rounded" should not have to
  // write three zeroes to be said.
  assert.equal(claimedRadius(perCorner, "topLeft"), 0);

  assert.equal(claimedRadius(undefined, "topLeft"), null);
  assert.equal(claimedRadius(null, "topLeft"), null);
});

test("isUniform separates the one-number claim from the four-corner one", () => {
  assert.equal(isUniform(0.12), true);
  assert.equal(isUniform({ bottomRight: 0.3 }), false);
  assert.equal(isUniform(undefined), false);
});
