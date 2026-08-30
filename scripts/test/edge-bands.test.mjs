#!/usr/bin/env node
/**
 * scripts/test/edge-bands.test.mjs — the furniture at the page's edges, compared.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { compareEdgeBands, edgeBand } from "../lib/edge-bands.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

function page(width, height, rects) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        const i = (y * width + x) * 4;
        png.data[i] = 20;
        png.data[i + 1] = 20;
        png.data[i + 2] = 20;
      }
    }
  }
  return png;
}

const masthead = { x: 60, y: 40, w: 400, h: 30 };
const body = { x: 60, y: 200, w: 500, h: 400 };
const pageNumber = { x: 280, y: 940, w: 60, h: 10 };

test("edgeBand reads the outermost band in each strip", () => {
  const png = page(600, 1000, [masthead, body, pageNumber]);
  const top = edgeBand(png, "top");
  assert.deepEqual({ y0: top.y0, y1: top.y1 }, { y0: 40, y1: 70 });
  const bottom = edgeBand(png, "bottom");
  assert.deepEqual({ y0: bottom.y0, y1: bottom.y1 }, { y0: 940, y1: 950 });
  assert.equal(edgeBand(page(600, 1000, [body]), "bottom"), null, "no ink in the bottom strip");
});

test("furniture where the reference has it is no finding", () => {
  const reference = page(600, 1000, [masthead, body, pageNumber]);
  const render = page(600, 1000, [masthead, body, { ...pageNumber, y: 944 }]);
  const r = compareEdgeBands(reference, render);
  assert.equal(r.tolerancePx, 8);
  assert.equal(r.bottom.delta, 4);
  assert.deepEqual(r.defects, []);
});

test("a page number lower than the reference's is named, with the direction and the fix", () => {
  const reference = page(600, 1000, [masthead, body, pageNumber]);
  const render = page(600, 1000, [masthead, body, { ...pageNumber, y: 962 }]);
  const r = compareEdgeBands(reference, render);
  assert.equal(r.defects.length, 1);
  assert.equal(r.defects[0].id, "bottom-band-lower");
  assert.match(r.defects[0].detail, /22px lower/);
  assert.match(r.defects[0].detail, /bottom margin or the footer zone/);
});

test("a masthead higher than the reference's, and a footer the render lacks", () => {
  const reference = page(600, 1000, [masthead, body, pageNumber]);
  const render = page(600, 1000, [{ ...masthead, y: 20 }, body]);
  const r = compareEdgeBands(reference, render);
  assert.deepEqual(r.defects.map((d) => d.id), ["top-band-higher", "bottom-band-missing"]);
});

test("images in different spaces are not compared", () => {
  const r = compareEdgeBands(page(300, 500, [pageNumber]), page(600, 1000, [pageNumber]));
  assert.equal(r.sameSpace, false);
  assert.deepEqual(r.defects, []);
});
