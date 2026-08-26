#!/usr/bin/env node
/**
 * scripts/test/page-geometry.test.mjs — the page size is measured, not assumed.
 *
 * The defect this covers shipped three times before anyone saw it. The design
 * stage had nothing to measure the reference against, so it wrote "A4"; the
 * diff resamples the reference to the render's exact width and height, so the
 * wrong proportions were stretched away before the pixels were compared; and
 * the accuracy contract's "page size matches the reference" was checked by
 * reading a stretched image. Every gate was green and every element placed
 * against page height was in the wrong place.
 *
 * So what is asserted here is the three-way verdict, and above all that a
 * reference matching nothing produces a QUESTION rather than a nearest guess.
 * A silent nearest-match would be the same defect with a shorter error bar.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  ASPECT_TOLERANCE_PERCENT,
  aspectOf,
  customSizeFor,
  measureReferenceGeometry,
  rankStandards,
  readPngSize,
} from "../lib/page-geometry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gcpg-"));
process.on("exit", () => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

let seq = 0;
function png(width, height) {
  const file = path.join(dir, `p${(seq += 1)}.png`);
  const image = new PNG({ width, height });
  image.data.fill(200);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  fs.writeFileSync(file, PNG.sync.write(image));
  return file;
}

test("dimensions come off the PNG header, with no decoder and no ImageMagick", () => {
  assert.deepEqual(readPngSize(png(413, 777)), { widthPx: 413, heightPx: 777 });
});

test("a file that is not a PNG is refused rather than measured as zero", () => {
  const file = path.join(dir, "not-a.png");
  fs.writeFileSync(file, "GIF89a and then some");
  assert.throws(() => readPngSize(file), /not a PNG/);
});

test("aspect is height over width, the way a page is described", () => {
  assert.equal(aspectOf({ widthPx: 400, heightPx: 600 }), 1.5);
  assert.throws(() => aspectOf({ widthPx: 0, heightPx: 10 }), /cannot take the aspect/);
});

test("an A4 reference is recognised as A4 and asks nothing", () => {
  // 595x842pt is A4 to within a rounding error, which is exactly the case that
  // must not generate a question.
  const result = measureReferenceGeometry([png(595, 842)]);
  assert.equal(result.verdict, "standard");
  assert.equal(result.pageSize.format, "A4");
  assert.equal(result.pageSize.orientation, "portrait");
  assert.equal(result.pageSize.source, "measured-standard");
  assert.ok(result.pageSize.deviationPercent <= ASPECT_TOLERANCE_PERCENT);
});

test("a US Letter reference is not silently called A4", () => {
  const result = measureReferenceGeometry([png(612, 792)]);
  assert.equal(result.verdict, "standard");
  assert.equal(result.pageSize.format, "LETTER");
});

test("a landscape reference keeps its standard and says it was turned", () => {
  const result = measureReferenceGeometry([png(842, 595)]);
  assert.equal(result.verdict, "standard");
  assert.equal(result.pageSize.format, "A4");
  assert.equal(result.pageSize.orientation, "landscape");
  // The turned page is wider than it is tall; the constant is still A4, which
  // is what lets the template write DocumentPageSize.A4.landscape().
  assert.ok(result.pageSize.widthPt > result.pageSize.heightPt);
});

test("a reference matching no standard is a question, not a nearest guess", () => {
  // 589x754 is mocha-profile-cv, which was built at A4 and came out ~10% out.
  const result = measureReferenceGeometry([png(589, 754)]);
  assert.equal(result.verdict, "ask");
  assert.equal(result.pageSize, undefined, "an unanswered question must not carry an answer");
  assert.ok(result.question.includes("589x754"));
  assert.ok(result.nearestStandard.deviationPercent > ASPECT_TOLERANCE_PERCENT);
  // Both options have to be in the question, or it is not a choice.
  assert.ok(result.question.includes(result.nearestStandard.name));
  assert.ok(result.question.includes("DocumentPageSize.of("));
});

test("the nearest standard is the nearest one, not the one that gets assumed", () => {
  // The whole defect in one assertion: this reference is nearer LETTER than A4,
  // and the run that broke it built at A4 without ever ranking the two.
  const result = measureReferenceGeometry([png(589, 754)]);
  assert.equal(result.nearestStandard.name, "LETTER");
  assert.equal(result.candidates[0].name, "LETTER");
  assert.ok(result.candidates[0].deviationPercent < result.candidates[1].deviationPercent);
});

test("the custom option keeps the measured proportions on a standard width", () => {
  const result = measureReferenceGeometry([png(589, 754)]);
  const { widthPt, heightPt, anchoredOn } = result.custom;
  assert.equal(anchoredOn, result.nearestStandard.name);
  assert.equal(widthPt, result.nearestStandard.widthPt);
  // Round-tripping the custom size must land back on the measured aspect: the
  // point of offering it is that it is the reference's shape, exactly.
  assert.ok(Math.abs(heightPt / widthPt - result.aspect) < 1e-3);
});

test("pages that disagree about their own size stop the chain", () => {
  const result = measureReferenceGeometry([png(595, 842), png(595, 700)]);
  assert.equal(result.verdict, "inconsistent");
  assert.deepEqual(
    result.disagreeingPages.map((p) => p.page),
    [2],
  );
  assert.ok(/mixed-dpi|two different sources/.test(result.question));
});

test("pages that agree are measured together and answered once", () => {
  const result = measureReferenceGeometry([png(595, 842), png(595, 842), png(595, 841)]);
  assert.equal(result.verdict, "standard");
  assert.equal(result.pages.length, 3);
  assert.deepEqual(
    result.pages.map((p) => p.page),
    [1, 2, 3],
  );
});

test("the tolerance is a knob, so a caller can be stricter than the default", () => {
  const file = png(589, 754);
  assert.equal(measureReferenceGeometry([file], { tolerancePercent: 2 }).verdict, "standard");
  assert.equal(measureReferenceGeometry([file], { tolerancePercent: 0.5 }).verdict, "ask");
});

test("measuring nothing is a refusal, not an empty verdict", () => {
  assert.throws(() => measureReferenceGeometry([]), /no pages to measure/);
});

test("ranking is ordered nearest-first and covers every standard", () => {
  const ranked = rankStandards(1.41429);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].name, "A4");
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i].deviationPercent >= ranked[i - 1].deviationPercent);
  }
});

test("a landscape custom size is anchored on the long edge", () => {
  // The first version of this test asserted only `width > height` and the
  // aspect, and both held while the size was wrong: the anchor comes out of
  // rankStandards already oriented, customSizeFor swapped it a second time, and
  // a landscape A4-ish page was built 595pt wide — the short edge — instead of
  // 842. Assert the dimension, not just its shape.
  const anchor = rankStandards(0.7)[0];
  assert.equal(anchor.orientation, "landscape");

  const custom = customSizeFor(0.7, anchor);
  assert.equal(custom.widthPt, anchor.widthPt, "the custom page must keep the anchor's width");
  assert.ok(custom.widthPt > 800, `a landscape A4 is ~842pt wide, got ${custom.widthPt}`);
  assert.ok(custom.widthPt > custom.heightPt);
  assert.ok(Math.abs(custom.heightPt / custom.widthPt - 0.7) < 1e-3);
});

test("a portrait custom size keeps the anchor's width too", () => {
  const anchor = rankStandards(1.28014)[0];
  assert.equal(anchor.name, "LETTER");
  const custom = customSizeFor(1.28014, anchor);
  assert.equal(custom.widthPt, 612);
  assert.ok(custom.heightPt > custom.widthPt);
});

test("the custom size offered in a landscape question is the turned page", () => {
  // End to end, because the bug above lived between two functions that were
  // each defensible on their own.
  const result = measureReferenceGeometry([png(1000, 690)]);
  assert.equal(result.verdict, "ask");
  assert.equal(result.orientation, "landscape");
  assert.ok(
    result.custom.widthPt > result.custom.heightPt,
    "a landscape reference must not be offered a portrait custom page",
  );
  assert.ok(Math.abs(result.custom.heightPt / result.custom.widthPt - result.aspect) < 1e-3);
});
