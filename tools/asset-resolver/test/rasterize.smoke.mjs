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
 * No network here. The SVGs are written by hand; only ImageMagick is real, and
 * the test skips itself where it is not installed rather than faking it.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rasterizeSvg } from "../src/iconify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { PNG } = createRequire(path.join(here, "..", "..", "visual-diff", "package.json"))("pngjs");

const MAGICK = process.env.MAGICK_BINARY || "magick";
const haveMagick =
  spawnSync(process.platform === "win32" ? "cmd.exe" : MAGICK,
    process.platform === "win32" ? ["/d", "/s", "/c", MAGICK, "-version"] : ["-version"],
    { encoding: "utf8" }).status === 0;

if (!haveMagick) {
  console.log("smoke: ImageMagick not installed — rasterize smoke SKIPPED");
  process.exit(0);
}

const square = (fill) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path fill="${fill}" d="M4 4h16v16H4z"/></svg>`,
    "utf8",
  );

/** Opaque pixels, and how many of them are white. */
function inspect(buffer) {
  const png = PNG.sync.read(buffer);
  let opaque = 0;
  let white = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    opaque += 1;
    if (png.data[i] > 240 && png.data[i + 1] > 240 && png.data[i + 2] > 240) white += 1;
  }
  return { width: png.width, height: png.height, opaque, white };
}

const white = inspect(await rasterizeSvg(square("#FFFFFF"), 96));
assert.ok(
  white.opaque > 0,
  "a white glyph rasterised to nothing — -transparent white is back, or -background none moved after the input",
);
assert.ok(
  white.white > 0,
  `the glyph survived but is not white any more (${white.opaque} opaque, ${white.white} white)`,
);
console.log(`smoke: white glyph survives = ok (${white.opaque} opaque px, ${white.white} white)`);

const dark = inspect(await rasterizeSvg(square("#181818"), 96));
assert.ok(dark.opaque > 0, "a dark glyph rasterised to nothing");
console.log(`smoke: dark glyph survives = ok (${dark.opaque} opaque px)`);

// The two are the same shape, so the same number of pixels should survive.
// A difference here means one of them is being treated as background.
assert.equal(
  white.opaque,
  dark.opaque,
  `colour changed how much of the glyph survived: white ${white.opaque}, dark ${dark.opaque}`,
);
console.log("smoke: colour does not change what survives = ok");

// The background must be transparent, not white — that is what -background
// none is there for, and the reason it must precede the input.
const framed = inspect(await rasterizeSvg(square("#181818"), 96));
assert.ok(
  framed.opaque < framed.width * framed.height,
  "every pixel is opaque — the SVG was rasterised onto a background",
);
console.log("smoke: background stays transparent = ok");

assert.equal(white.width, 96, "the requested size was not honoured");
console.log("smoke: PASS");
