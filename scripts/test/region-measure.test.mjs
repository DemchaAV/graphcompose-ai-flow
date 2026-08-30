#!/usr/bin/env node
/**
 * scripts/test/region-measure.test.mjs — the reference side of a region,
 * measured rather than eyeballed.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { contrastBounds, correlateShift, measureRegion, windowBackground, windowFor } from "../lib/region-measure.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

/** A page of one colour with rectangles of others drawn on it. */
function page(width, height, background, rects) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = background[0];
    png.data[i + 1] = background[1];
    png.data[i + 2] = background[2];
    png.data[i + 3] = 255;
  }
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        const i = (y * width + x) * 4;
        png.data[i] = r.color[0];
        png.data[i + 1] = r.color[1];
        png.data[i + 2] = r.color[2];
      }
    }
  }
  return png;
}

const WHITE = [255, 255, 255];
const INK = [30, 30, 30];
const NAVY = [24, 40, 88];

test("contrastBounds finds the ink box inside a padded window, against the window's own background", () => {
  const png = page(400, 400, WHITE, [{ x: 100, y: 120, w: 80, h: 30, color: INK }]);
  // Analysis bounds a little off the truth, as eyeballed bounds are.
  const bounds = { x: 0.24, y: 0.29, w: 0.22, h: 0.09 };
  const window = windowFor(png, bounds, 0.02);
  const box = contrastBounds(png, window);
  assert.deepEqual({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, { x0: 100, y0: 120, x1: 180, y1: 150 });
  assert.deepEqual(windowBackground(png, window), { r: 255, g: 255, b: 255 });
});

test("a region on a coloured panel is measured against the panel, not the page", () => {
  const png = page(400, 400, WHITE, [
    { x: 0, y: 0, w: 140, h: 400, color: NAVY },
    { x: 20, y: 60, w: 90, h: 12, color: WHITE },
  ]);
  const bounds = { x: 0.04, y: 0.14, w: 0.25, h: 0.05 };
  const box = contrastBounds(png, windowFor(png, bounds, 0.01));
  assert.deepEqual({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, { x0: 20, y0: 60, x1: 110, y1: 72 });
});

test("an empty window measures null rather than a box", () => {
  const png = page(200, 200, WHITE, []);
  assert.equal(contrastBounds(png, windowFor(png, { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, 0)), null);
});

test("measureRegion subtracts the two boxes into a shift in the render's pixels", () => {
  const reference = page(600, 800, WHITE, [{ x: 100, y: 200, w: 200, h: 40, color: INK }]);
  const render = page(600, 800, WHITE, [{ x: 112, y: 191, w: 200, h: 40, color: INK }]);
  const m = measureRegion(reference, render, { x: 0.15, y: 0.24, w: 0.36, h: 0.06 });
  assert.equal(m.sameSpace, true);
  assert.deepEqual(m.shift, { dx: 12, dy: -9, dWidth: 0, dHeight: 0 });
  assert.deepEqual(m.reference.bounds, { x: 0.1667, y: 0.25, w: 0.3333, h: 0.05 });
  assert.ok(m.correlation, "the correlation should have run");
  // The correlation runs at a 4-pixel downsample, so it agrees to within a block.
  assert.ok(Math.abs(m.correlation.dx - 12) <= 4, `correlation dx ${m.correlation.dx} should be within a block of 12`);
  assert.ok(Math.abs(m.correlation.dy - -9) <= 4, `correlation dy ${m.correlation.dy} should be within a block of -9`);
  assert.ok(m.correlation.score > 0.9, `score ${m.correlation.score}`);
});

test("a size change is reported as dWidth/dHeight, not as a shift of the far edge", () => {
  const reference = page(600, 800, WHITE, [{ x: 100, y: 200, w: 200, h: 40, color: INK }]);
  const render = page(600, 800, WHITE, [{ x: 100, y: 200, w: 260, h: 40, color: INK }]);
  const m = measureRegion(reference, render, { x: 0.15, y: 0.24, w: 0.44, h: 0.06 });
  assert.deepEqual(m.shift, { dx: 0, dy: 0, dWidth: 60, dHeight: 0 });
  assert.equal(m.render.clipped, false);

  // Ink that runs past the widened window is reported clipped, not measured.
  const wide = page(600, 800, WHITE, [{ x: 100, y: 200, w: 400, h: 40, color: INK }]);
  const clipped = measureRegion(reference, wide, { x: 0.15, y: 0.24, w: 0.36, h: 0.06 });
  assert.equal(clipped.render.clipped, true);
});

test("images of different sizes measure both sides but no shift", () => {
  const reference = page(300, 400, WHITE, [{ x: 50, y: 100, w: 100, h: 20, color: INK }]);
  const render = page(600, 800, WHITE, [{ x: 100, y: 200, w: 200, h: 40, color: INK }]);
  const m = measureRegion(reference, render, { x: 0.15, y: 0.24, w: 0.36, h: 0.06 });
  assert.equal(m.sameSpace, false);
  assert.equal(m.shift, null);
  assert.equal(m.correlation, null);
  assert.ok(m.reference && m.render);
});

test("correlateShift refuses a flat crop and finds a textured one", () => {
  const flat = page(200, 200, WHITE, []);
  assert.equal(correlateShift(flat, flat, { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }), null);

  const reference = page(400, 400, WHITE, [
    { x: 100, y: 100, w: 40, h: 8, color: INK },
    { x: 100, y: 120, w: 60, h: 8, color: INK },
    { x: 100, y: 140, w: 30, h: 8, color: INK },
  ]);
  const render = page(400, 400, WHITE, [
    { x: 116, y: 100, w: 40, h: 8, color: INK },
    { x: 116, y: 120, w: 60, h: 8, color: INK },
    { x: 116, y: 140, w: 30, h: 8, color: INK },
  ]);
  const c = correlateShift(reference, render, { x: 0.24, y: 0.24, w: 0.17, h: 0.13 });
  assert.ok(c);
  assert.equal(c.dx, 16);
  assert.equal(c.dy, 0);
});
