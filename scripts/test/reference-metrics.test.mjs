#!/usr/bin/env node
/**
 * scripts/test/reference-metrics.test.mjs — the arithmetic is right, and it is
 * right in the units it claims.
 *
 * The rasters are synthesised rather than committed. Every assertion here is
 * about a number whose correct value is known by construction — a band drawn at
 * y 40..50 must come back as y0 40, y1 50 — and a fixture PNG would only hide
 * that behind a file nobody can check by reading it. It also lets the
 * differently-sized pair that {@link comparableBands} exists for be built
 * exactly, at a scale chosen to expose an off-by-one rather than absorb it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  comparableBands,
  inkBands,
  inkBounds,
  pageMetrics,
  samplePalette,
} from "../lib/reference-metrics.mjs";

const round4 = (n) => Math.round(n * 1e4) / 1e4;

/** A white RGBA raster. */
function blank(width, height) {
  const data = new Uint8Array(width * height * 4).fill(255);
  return { width, height, data };
}

/** Paint an opaque rectangle, [x0, x1) by [y0, y1). */
function fill(png, x0, y0, x1, y1, [r, g, b] = [0, 0, 0]) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * png.width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

test("page metrics report size, aspect and the margins the ink implies", () => {
  const png = fill(blank(200, 100), 20, 10, 180, 90);
  const metrics = pageMetrics(png);

  assert.equal(metrics.width, 200);
  assert.equal(metrics.height, 100);
  assert.equal(metrics.aspect, 2);
  // Measured from ink, not assumed: a reference cropped tight and one with white
  // space around it are the same document, and only the ink says which you have.
  assert.deepEqual(metrics.margins, { top: 10, right: 20, bottom: 10, left: 20 });
  assert.deepEqual(metrics.inkBounds, { x0: 20, y0: 10, x1: 180, y1: 90 });
});

test("a blank page reports no ink bounds rather than a box at the origin", () => {
  const metrics = pageMetrics(blank(50, 50));
  assert.equal(metrics.inkBounds, null);
  assert.deepEqual(metrics.margins, { top: 0, right: 0, bottom: 0, left: 0 });
});

test("ink bands are the runs of rows carrying ink, with their own extents", () => {
  const png = blank(100, 100);
  fill(png, 10, 10, 60, 20); // a wide band
  fill(png, 10, 40, 30, 45); // a narrower one lower down

  const bands = inkBands(png, { x0: 0, y0: 0, x1: 100, y1: 100 });
  assert.equal(bands.length, 2);
  assert.deepEqual(bands[0], { y0: 10, y1: 20, height: 10, x0: 10, x1: 60 });
  assert.deepEqual(bands[1], { y0: 40, y1: 45, height: 5, x0: 10, x1: 30 });
});

test("the column window is what separates two columns into their own bands", () => {
  // Side by side at overlapping heights. Scanned whole-page they merge into one
  // run; scanned per column they are what the caller actually asked about. This
  // is why the window is an argument and not an internal detail.
  const png = blank(200, 100);
  fill(png, 10, 10, 80, 20); // left column, upper
  fill(png, 120, 15, 190, 25); // right column, lower and overlapping

  const whole = inkBands(png, { x0: 0, y0: 0, x1: 200, y1: 100 });
  assert.equal(whole.length, 1, "overlapping columns should merge without a window");

  const left = inkBands(png, { x0: 0, y0: 0, x1: 100, y1: 100 });
  assert.deepEqual(left, [{ y0: 10, y1: 20, height: 10, x0: 10, x1: 80 }]);

  const right = inkBands(png, { x0: 100, y0: 0, x1: 200, y1: 100 });
  assert.deepEqual(right, [{ y0: 15, y1: 25, height: 10, x0: 120, x1: 190 }]);
});

test("a gap tolerance joins runs a clean row would have split", () => {
  const png = blank(100, 100);
  fill(png, 10, 10, 50, 15);
  fill(png, 10, 17, 50, 22); // two blank rows between

  assert.equal(inkBands(png, { x0: 0, y0: 0, x1: 100, y1: 100 }).length, 2);

  const joined = inkBands(png, { x0: 0, y0: 0, x1: 100, y1: 100 }, { gap: 2 });
  assert.equal(joined.length, 1);
  assert.deepEqual(joined[0], { y0: 10, y1: 22, height: 12, x0: 10, x1: 50 });
});

test("a window outside the raster is clamped rather than read out of bounds", () => {
  const png = fill(blank(50, 50), 0, 0, 50, 50);
  const bounds = inkBounds(png, { x0: -20, y0: -20, x1: 500, y1: 500 });
  assert.deepEqual(bounds, { x0: 0, y0: 0, x1: 50, y1: 50 });
});

test("the palette is ranked by coverage and quantised against anti-aliasing", () => {
  const png = blank(100, 100); // 10,000 white
  fill(png, 0, 0, 100, 30, [6, 100, 112]); // 3,000 teal
  // Two near-identical teals, one raster row apart in value — anti-aliasing, not
  // design. They must collapse into one entry, or a single rule reports as a
  // gradient of several hundred colours.
  fill(png, 0, 30, 100, 40, [8, 102, 114]);

  const palette = samplePalette(png, undefined, { bucket: 16 });
  assert.equal(palette[0].hex, "#ffffff", "white is the ground and should lead");
  // Low red is what separates the teals from the white ground; green and blue
  // alone do not, since white is high in both.
  const teals = palette.filter((entry) => entry.rgb[0] < 64);
  assert.equal(teals.length, 1, `anti-aliased neighbours did not collapse: ${JSON.stringify(palette)}`);
  assert.equal(teals[0].share, 0.4, "3,000 + 1,000 of 10,000");
});

test("a window scopes the palette to one region", () => {
  const png = blank(100, 100);
  fill(png, 0, 0, 100, 50, [200, 0, 0]);

  const top = samplePalette(png, { x0: 0, y0: 0, x1: 100, y1: 50 });
  assert.equal(top.length, 1);
  assert.equal(top[0].share, 1);
});

test("comparable bands come back in reference units whatever the render's raster is", () => {
  // The case this module exists for: two rasters of different sizes. 100 -> 150
  // is a scale of 1.5, chosen because it maps the reference band at y 20..30 to
  // render rows 30..45 exactly, so a unit error cannot hide in rounding.
  const reference = blank(100, 100);
  fill(reference, 10, 20, 90, 30);

  const render = blank(150, 150);
  fill(render, 15, 30, 135, 45);

  const result = comparableBands(reference, render, [
    { name: "band", x0: 0, y0: 0, x1: 100, y1: 100 },
  ]);

  assert.equal(result.units, "reference pixels");
  assert.equal(result.scale, 1.5);
  assert.equal(result.aspectDrift, 0);

  const [window] = result.windows;
  assert.equal(window.name, "band");
  assert.ok(window.bandCountMatches);
  assert.deepEqual(window.reference, [{ y0: 20, y1: 30, height: 10, x0: 10, x1: 90 }]);
  // The render's own pixels are 30..45; reported back in reference units they are
  // 20..30 again, which is the whole point.
  assert.deepEqual(window.render, [{ y0: 20, y1: 30, height: 10, x0: 10, x1: 90 }]);
});

test("a real difference survives the unit conversion instead of being absorbed", () => {
  const reference = blank(100, 100);
  fill(reference, 10, 20, 90, 30);

  const render = blank(150, 150);
  fill(render, 15, 45, 135, 60); // 15 reference px lower than it should be

  const [window] = comparableBands(reference, render, [
    { name: "band", x0: 0, y0: 0, x1: 100, y1: 100 },
  ]).windows;

  assert.equal(window.reference[0].y0, 20);
  assert.equal(window.render[0].y0, 30, "a 10 reference-px drop was not reported as one");
});

test("an aspect mismatch is reported rather than absorbed into the scale", () => {
  // One scale, taken from width. Scaling each axis independently would make a
  // stretched render look like a matching one, which is the failure a parity
  // check exists to catch.
  const reference = blank(100, 100);
  const render = blank(200, 300);

  const result = comparableBands(reference, render, []);
  assert.equal(result.scale, 2);
  // width/height, the same way pageMetrics reports aspect. The two must not be
  // each other's reciprocal, or `measure` and `compare` disagree by a sign.
  assert.equal(result.aspectDrift, round4(200 / 300 - 1), "200/300 - 100/100");
});

test("mismatched band counts are stated, not left to be inferred from the lists", () => {
  const reference = blank(100, 100);
  fill(reference, 10, 20, 90, 30);
  fill(reference, 10, 50, 90, 60);

  const render = blank(100, 100);
  fill(render, 10, 20, 90, 30); // the second band never rendered

  const [window] = comparableBands(reference, render, [
    { name: "body", x0: 0, y0: 0, x1: 100, y1: 100 },
  ]).windows;

  assert.equal(window.reference.length, 2);
  assert.equal(window.render.length, 1);
  assert.equal(window.bandCountMatches, false);
});
