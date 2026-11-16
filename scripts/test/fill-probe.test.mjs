#!/usr/bin/env node
/**
 * scripts/test/fill-probe.test.mjs — a fill is measured, not asserted.
 *
 * The run these come from measured a container's shape, radius, sizing and
 * repeat count correctly and answered `fill.present: true` for a container that
 * paints nothing: the peach sidebar shows straight through it, and only a coral
 * hairline marks its edge. That one field was the first thing a reader noticed
 * about the render.
 *
 * Rasters are synthesised here, so the cases are exact and no file is needed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { describeColour, modalColour, probeFill, sameColour } from "../lib/fill-probe.mjs";

/** A blank page of `ground`, with optional boxes painted on it. */
function page(ground, boxes = [], width = 200, height = 200) {
  const data = new Uint8Array(width * height * 4);
  const put = (x, y, [r, g, b]) => {
    const i = (width * y + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, ground);
  for (const box of boxes) {
    for (let y = box.y0; y < box.y1; y += 1) {
      for (let x = box.x0; x < box.x1; x += 1) {
        const edge = x < box.x0 + 1 || x >= box.x1 - 1 || y < box.y0 + 1 || y >= box.y1 - 1;
        if (edge && box.border) put(x, y, box.border);
        else if (box.fill) put(x, y, box.fill);
      }
    }
  }
  return { width, height, data };
}

const PEACH = [253, 241, 237];
const WHITE = [255, 255, 255];
const CORAL = [243, 206, 197];
const INK = [20, 20, 20];

/** The competency card's frame: x 40..160, y 40..80 of a 200x200 page. */
const CARD = { x: 40 / 200, y: 40 / 200, w: 120 / 200, h: 40 / 200 };

test("THE CASE: a bordered container with no fill reads as unfilled", () => {
  // What the reference actually has, and what the analysis got wrong.
  const raster = page(PEACH, [{ x0: 40, y0: 40, x1: 160, y1: 80, border: CORAL }]);
  const probe = probeFill(raster, CARD);

  assert.equal(probe.measurable, true);
  assert.equal(probe.filled, false, "the ground shows through, so it paints nothing");
  assert.ok(sameColour(probe.inside, probe.outside), "same ground on both sides");
});

test("a container filled with something else reads as filled", () => {
  const raster = page(PEACH, [{ x0: 40, y0: 40, x1: 160, y1: 80, fill: WHITE, border: CORAL }]);
  const probe = probeFill(raster, CARD);

  assert.equal(probe.filled, true);
  assert.ok(sameColour(probe.inside, WHITE), `inside was ${describeColour(probe.inside)}`);
  assert.ok(sameColour(probe.outside, PEACH));
});

test("a fill that matches the background still counts as a fill only if it differs", () => {
  // The honest limit: paint indistinguishable from the ground is
  // indistinguishable from no paint, and the probe says so rather than guessing.
  const raster = page(PEACH, [{ x0: 40, y0: 40, x1: 160, y1: 80, fill: PEACH, border: CORAL }]);
  assert.equal(probeFill(raster, CARD).filled, false);
});

test("text inside the container does not move the answer", () => {
  // The mean of this box is a colour that appears nowhere in it; the mode is
  // the ground. That is why the probe takes the mode.
  const withText = [
    { x0: 40, y0: 40, x1: 160, y1: 80, border: CORAL },
    { x0: 60, y0: 55, x1: 120, y1: 65, fill: INK },
  ];
  assert.equal(probeFill(page(PEACH, withText), CARD).filled, false, "an unfilled box with a label");

  const filledWithText = [
    { x0: 40, y0: 40, x1: 160, y1: 80, fill: WHITE, border: CORAL },
    { x0: 60, y0: 55, x1: 120, y1: 65, fill: INK },
  ];
  assert.equal(probeFill(page(PEACH, filledWithText), CARD).filled, true, "a filled box with a label");
});

test("a thick border is not mistaken for a fill", () => {
  const thick = { x0: 40, y0: 40, x1: 160, y1: 80, border: CORAL };
  const raster = page(PEACH, [thick]);
  // Widen the border by painting a second ring inside the first.
  for (let y = 41; y < 79; y += 1) {
    for (let x = 41; x < 159; x += 1) {
      if (x < 43 || x >= 157 || y < 43 || y >= 77) {
        const i = (200 * y + x) * 4;
        raster.data[i] = CORAL[0];
        raster.data[i + 1] = CORAL[1];
        raster.data[i + 2] = CORAL[2];
      }
    }
  }
  assert.equal(probeFill(raster, CARD).filled, false, "the interior is still the ground");
});

test("a container too small to sample says so instead of guessing", () => {
  const raster = page(PEACH);
  const tiny = probeFill(raster, { x: 0.5, y: 0.5, w: 0.02, h: 0.02 });
  assert.equal(tiny.measurable, false);
  assert.equal(tiny.filled, null, "null is not false");
  assert.match(tiny.reason, /too small/);
});

test("anti-aliasing noise does not split one colour into many", () => {
  // Neighbouring shades of the same ground must land in one bucket, or the
  // mode becomes whichever shade happened to appear twice.
  const raster = page(PEACH, [{ x0: 40, y0: 40, x1: 160, y1: 80, border: CORAL }]);
  for (let y = 45; y < 75; y += 2) {
    for (let x = 45; x < 155; x += 2) {
      const i = (200 * y + x) * 4;
      raster.data[i] = PEACH[0] - 1;
      raster.data[i + 2] = PEACH[2] + 1;
    }
  }
  assert.equal(probeFill(raster, CARD).filled, false);
});

test("modalColour returns the most common sample, and nothing off the page", () => {
  const raster = page(PEACH, [{ x0: 0, y0: 0, x1: 10, y1: 10, fill: WHITE }]);
  assert.ok(sameColour(modalColour(raster, [[1, 1], [2, 2], [50, 50]]), WHITE));
  assert.equal(modalColour(raster, [[-5, -5], [999, 999]]), null, "out of bounds is not a colour");
  assert.equal(modalColour(raster, []), null);
});

test("sameColour tolerates a shade and refuses a different colour", () => {
  assert.equal(sameColour(PEACH, [252, 242, 240]), true);
  assert.equal(sameColour(PEACH, WHITE), false);
  assert.equal(sameColour(null, PEACH), false);
});
