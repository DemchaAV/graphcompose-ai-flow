#!/usr/bin/env node
/**
 * Smoke test for the SVG -> PNG fallback in tools/asset-resolver/src/iconify.mjs.
 *
 * Icons resolve as SVG, so this path is the fallback — taken only for an SVG
 * outside the reader's subset. It still has to produce an image.
 *
 * It did not, for anything light. `-background none` is a setting the SVG
 * delegate reads while rasterising, not an operation applied to the result, and
 * it sat AFTER the input where it did nothing. The SVG was rasterised onto
 * white and a trailing `-transparent white` knocked that background out again,
 * taking a white glyph with it: an icon requested with `color=#FFFFFF`, for a
 * white glyph inside a coloured badge, came back with not one opaque pixel.
 *
 * A fallback that silently produces nothing is worse than one that fails, and
 * nothing above this would notice: the PNG is a valid file of the right size.
 *
 * The measurements come from ImageMagick rather than a PNG decoder. This
 * package has no dependencies and its CI job installs none, so reaching into a
 * sibling module's node_modules for pngjs worked locally and failed on the
 * runner. The tool under test can report its own pixel statistics exactly.
 *
 * No network here: the SVGs are written by hand. Where ImageMagick is not
 * installed the test skips itself rather than faking it.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const MAGICK = process.env.MAGICK_BINARY || "magick";
const onWindows = process.platform === "win32";

/** Run `magick` with stdin, returning { status, stdout } — stdout as a Buffer. */
function magick(args, input) {
  return onWindows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", MAGICK, ...args], { input })
    : spawnSync(MAGICK, args, { input });
}

if (magick(["-version"]).status !== 0) {
  console.log("smoke: ImageMagick not installed — rasterize smoke SKIPPED");
  process.exit(0);
}

const { rasterizeSvg } = await import("../src/iconify.mjs");

const square = (fill) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path fill="${fill}" d="M4 4h16v16H4z"/></svg>`,
    "utf8",
  );

/** One `fx` expression evaluated over a PNG, as a number. */
function measure(png, expression) {
  const run = magick(["png:-", "-format", `%[fx:${expression}]`, "info:-"], png);
  assert.equal(run.status, 0, `measuring ${expression} failed: ${run.stderr}`);
  const value = Number(run.stdout.toString("utf8").trim());
  assert.ok(Number.isFinite(value), `${expression} did not measure to a number`);
  return value;
}

const white = await rasterizeSvg(square("#FFFFFF"), 96);
const dark = await rasterizeSvg(square("#181818"), 96);

// mean.a is the average alpha over the whole canvas: 0 means every pixel is
// transparent, which is exactly what a white glyph used to produce.
const whiteCoverage = measure(white, "mean.a");
const darkCoverage = measure(dark, "mean.a");

assert.ok(
  whiteCoverage > 0,
  "a white glyph rasterised to nothing — -transparent white is back, or -background none moved after the input",
);
console.log(`smoke: white glyph survives = ok (alpha mean ${whiteCoverage.toFixed(3)})`);

assert.ok(darkCoverage > 0, "a dark glyph rasterised to nothing");
console.log(`smoke: dark glyph survives = ok (alpha mean ${darkCoverage.toFixed(3)})`);

// The two are the same shape, so the same share of the canvas should survive.
// A difference means one colour is being treated as background.
assert.ok(
  Math.abs(whiteCoverage - darkCoverage) < 0.001,
  `colour changed how much survived: white ${whiteCoverage}, dark ${darkCoverage}`,
);
console.log("smoke: colour does not change what survives = ok");

// And the white one is still white rather than surviving as some other colour.
const whitePeak = measure(white, "maxima.r");
assert.ok(whitePeak > 0.9, `the glyph survived but is not white (peak red ${whitePeak})`);
console.log(`smoke: the white glyph is still white = ok (peak red ${whitePeak.toFixed(3)})`);

// The background must be transparent, not white — that is what -background none
// is for, and the reason it has to precede the input.
assert.ok(
  darkCoverage < 1,
  "every pixel is opaque — the SVG was rasterised onto a background",
);
console.log("smoke: background stays transparent = ok");

assert.equal(measure(white, "w"), 96, "the requested size was not honoured");
console.log("smoke: PASS");
