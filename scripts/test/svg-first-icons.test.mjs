#!/usr/bin/env node
/**
 * scripts/test/svg-first-icons.test.mjs — a vector icon stays a vector.
 *
 * The resolver used to rasterise every Iconify icon on the way in, on the
 * premise that GraphCompose could not draw SVG. It can: `SvgIcon.read(Path)`
 * plus `addSvgIcon(icon, width)` are in the 2.2 allow-list, and the reader
 * handles the geometry an icon set actually ships. Rasterising by default threw
 * away scalability for every icon in order to survive the rare one outside the
 * subset.
 *
 * So the contract these tests hold is: SVG unless GraphCompose genuinely cannot
 * draw it, PNG when it cannot, and a recorded reason either way. The subset is
 * not invented here — it is GraphCompose 2.2's documented reader behaviour, and
 * the distinction that matters is between input it REFUSES and input it merely
 * degrades.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkSvgCompatibility } from "../../tools/asset-resolver/src/svg-compat.mjs";
import { _internal } from "../../tools/asset-resolver/src/icon-cache.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** What Iconify actually returns for an ordinary icon. */
const TYPICAL_ICONIFY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
  '<path fill="#181818" d="M12 2 2 7l10 5 10-5zm0 7.5L4.5 6 12 3.8 19.5 6z"/></svg>';

// --- what stays vector --------------------------------------------------------

test("an ordinary Iconify icon is drawable and stays SVG", () => {
  const result = checkSvgCompatibility(TYPICAL_ICONIFY_ICON);
  assert.equal(result.compatible, true, result.reasons.join("; "));
  assert.equal(result.geometryCount, 1);
});

test("Iconify's own em-sized root does not trigger the fallback", () => {
  // Every icon Iconify serves is `width="1em" height="1em" viewBox="0 0 24 24"`.
  // Judging the root by those units rasterised the entire icon set, which is to
  // say it left the pipeline exactly as it was. The viewBox is the frame; the
  // root width and height are only read when there is none.
  const iconify =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path fill="#181818" d="M20 15.5c-1.2 0-2.5-.2-3.6-.6Z"/></svg>';
  const result = checkSvgCompatibility(iconify);
  assert.equal(result.compatible, true, result.reasons.join("; "));
});

test("a relative unit still fails where the length is actually read", () => {
  const svg = '<svg viewBox="0 0 8 8"><rect width="50%" height="2"/></svg>';
  assert.equal(checkSvgCompatibility(svg).compatible, false);
});

test("the basic shapes the reader lowers are all accepted", () => {
  const shapes =
    '<svg viewBox="0 0 24 24">' +
    '<rect x="1" y="1" width="4" height="4" rx="1"/><circle cx="8" cy="8" r="2"/>' +
    '<ellipse cx="12" cy="12" rx="3" ry="2"/><line x1="0" y1="0" x2="4" y2="4"/>' +
    '<polyline points="1,1 2,2"/><polygon points="3,3 4,4 5,3"/></svg>';
  const result = checkSvgCompatibility(shapes);
  assert.equal(result.compatible, true, result.reasons.join("; "));
  assert.equal(result.geometryCount, 6);
});

test("supported transforms and gradients keep the icon vector", () => {
  const svg =
    '<svg viewBox="0 0 24 24">' +
    '<linearGradient id="g" spreadMethod="pad"><stop offset="0" stop-color="#fff"/></linearGradient>' +
    '<g transform="translate(2 2) scale(1.5) rotate(45)">' +
    '<path fill="url(#g)" d="M0 0 L4 4 Z"/></g></svg>';
  const result = checkSvgCompatibility(svg);
  assert.equal(result.compatible, true, result.reasons.join("; "));
});

test("dropped-but-survivable content degrades rather than falling back", () => {
  // The reader skips text/image/use with a warning as long as geometry remains.
  // Falling back to a raster here would rasterise an icon that renders fine.
  const svg =
    '<svg viewBox="0 0 24 24"><text x="0" y="0">label</text>' +
    '<path d="M0 0 L4 4 Z"/></svg>';
  const result = checkSvgCompatibility(svg);
  assert.equal(result.compatible, true, result.reasons.join("; "));
  assert.deepEqual(result.droppedKinds, ["text"], "the loss should still be reported");
});

// --- what genuinely cannot be drawn ------------------------------------------

const REFUSED = [
  ["no <svg> root", "<div><path d=\"M0 0\"/></div>", /no <svg> root/],
  [
    "a DOCTYPE",
    '<!DOCTYPE svg><svg viewBox="0 0 8 8"><path d="M0 0 L1 1"/></svg>',
    /DOCTYPE/,
  ],
  [
    "no viewBox and unit-bearing dimensions",
    '<svg width="2em" height="2em"><path d="M0 0 L1 1"/></svg>',
    /viewBox/,
  ],
  [
    "a path command outside the supported families",
    '<svg viewBox="0 0 8 8"><path d="M0 0 X4 4"/></svg>',
    /unsupported path command "X"/,
  ],
  [
    "path data that does not start with a moveto",
    '<svg viewBox="0 0 8 8"><path d="L4 4 Z"/></svg>',
    /must start with a moveto/,
  ],
  [
    "a skew transform",
    '<svg viewBox="0 0 8 8"><g transform="skewX(20)"><path d="M0 0 L1 1"/></g></svg>',
    /unsupported transform "skewX\(\)"/,
  ],
  [
    "a relative unit in a length",
    '<svg viewBox="0 0 8 8"><path stroke-width="0.5em" d="M0 0 L1 1"/></svg>',
    /relative unit in stroke-width/,
  ],
  [
    "a spreadMethod PDF shading cannot map",
    '<svg viewBox="0 0 8 8"><linearGradient id="g" spreadMethod="reflect"/>' +
      '<path fill="url(#g)" d="M0 0 L1 1"/></svg>',
    /spreadMethod/,
  ],
  [
    "a paint referencing an id that is not defined",
    '<svg viewBox="0 0 8 8"><path fill="url(#missing)" d="M0 0 L1 1"/></svg>',
    /references #missing/,
  ],
  [
    "nothing drawable at all",
    '<svg viewBox="0 0 8 8"><text x="0" y="0">only text</text></svg>',
    /no drawable geometry/,
  ],
];

for (const [label, svg, expected] of REFUSED) {
  test(`${label} falls back to a raster, with the reason recorded`, () => {
    const result = checkSvgCompatibility(svg);
    assert.equal(result.compatible, false, "this should not have been accepted as drawable");
    assert.ok(
      result.reasons.some((reason) => expected.test(reason)),
      `reasons were: ${result.reasons.join("; ")}`,
    );
  });
}

test("a comment cannot smuggle in a refusal", () => {
  const svg = '<svg viewBox="0 0 8 8"><!-- transform="skewX(9)" --><path d="M0 0 L1 1"/></svg>';
  assert.equal(checkSvgCompatibility(svg).compatible, true);
});

// --- the cache ---------------------------------------------------------------

test("the SVG cache key ignores raster size and the PNG key does not", () => {
  const { hashIcon, hashIconSvg } = _internal;
  const small = { size: 32, color: "#111111" };
  const large = { size: 512, color: "#111111" };

  assert.notEqual(hashIcon("mdi", "home", small), hashIcon("mdi", "home", large),
    "a PNG's bytes depend on the size it was rendered at");
  assert.equal(hashIconSvg("mdi", "home", small), hashIconSvg("mdi", "home", large),
    "the same markup was re-downloaded once per requested size");
  assert.notEqual(hashIconSvg("mdi", "home", small), hashIconSvg("mdi", "home", { color: "#222222" }),
    "colour is baked into the markup and must stay in the key");
  assert.notEqual(hashIconSvg("mdi", "home", small), hashIcon("mdi", "home", small),
    "an SVG and a PNG of the same icon must not collide in one cache directory");
});

// --- the manifest contract ---------------------------------------------------

test("the manifest schema accepts an SVG icon and a PNG fallback, and legacy entries", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "schemas", "assets-manifest.schema.json"), "utf8"),
  );
  const icon = schema.$defs.icon;

  assert.match("assets/icons/mail.svg", new RegExp(icon.properties.file.pattern));
  assert.match("assets/icons/mail.png", new RegExp(icon.properties.file.pattern));
  assert.deepEqual(icon.properties.format.enum, ["svg", "png"]);
  assert.ok(
    icon.properties.size.type.includes("null"),
    "an SVG has no pixel size; a number there would be a fiction the template might honour",
  );
  assert.ok(
    !icon.required.includes("format"),
    "manifests written before SVG-first had no format field and were correct when written",
  );
});

test("the resolver writes the format it chose rather than leaving it to be inferred", () => {
  const cli = fs.readFileSync(
    path.join(repoRoot, "tools", "asset-resolver", "src", "cli.mjs"),
    "utf8",
  );
  assert.match(cli, /format,/, "format is not recorded in the manifest entry");
  assert.match(cli, /fallbackReason/, "the reason for a raster is not recorded");
  assert.match(cli, /checkSvgCompatibility/, "the resolver does not check compatibility at all");
});

test("nothing in the harness still claims GraphCompose cannot render SVG", () => {
  // The stale claim is what justified rasterising everything.
  const suspects = [
    path.join(repoRoot, "tools", "asset-resolver", "src", "iconify.mjs"),
    path.join(repoRoot, "tools", "asset-resolver", "README.md"),
  ].filter((file) => fs.existsSync(file));

  for (const file of suspects) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(
      !/cannot render svg|does not support svg|no svg support/i.test(text),
      `${path.relative(repoRoot, file)} still says GraphCompose cannot render SVG`,
    );
  }
});

// --- keep the temp dir tidy for the suite ------------------------------------

test("the compatibility check does not touch the filesystem", () => {
  const before = fs.readdirSync(os.tmpdir()).length;
  checkSvgCompatibility(TYPICAL_ICONIFY_ICON);
  assert.equal(fs.readdirSync(os.tmpdir()).length, before);
});
