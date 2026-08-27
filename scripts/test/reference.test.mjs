#!/usr/bin/env node
/**
 * scripts/test/reference.test.mjs — the CLI's contract, not the arithmetic.
 *
 * The measurements themselves are asserted in `reference-metrics.test.mjs`
 * against synthesised rasters. What is asserted here is everything that sits
 * between a caller and those functions: that a window parses in the order the
 * usage text claims, that several windows resolve in ONE invocation, that the
 * units the payload advertises are the units it reports, and that a missing
 * input is refused with a code rather than a stack trace.
 *
 * The batching assertion is the one that matters. The failure this command was
 * built for was 76 separate measurement calls; a version of it that answered one
 * window per invocation would reproduce that failure with better syntax.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "reference.mjs");
const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));
const { PNG } = require("pngjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcref-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A PNG on disk: white ground, one black band per `[y0, y1)` given. */
function writePng(file, width, height, bands) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (const [x0, y0, x1, y1] of bands) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 255;
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/**
 * A workspace with one project: a reference, and a render at 1.5x carrying the
 * same two bands. The scale is chosen so reference rows 20..30 land on render
 * rows 30..45 exactly — a unit error cannot hide in rounding.
 */
function scenario(label = "ws") {
  const root = tempDir(label);
  const project = path.join(root, "projects", "demo");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "workspace.json"),
    JSON.stringify({ schemaVersion: 1, name: label }, null, 2),
    "utf8",
  );
  writePng(path.join(project, "reference", "reference.png"), 100, 200, [
    [10, 20, 90, 30],
    [10, 60, 50, 70],
  ]);
  writePng(path.join(project, "revisions", "revision-001", "output.png"), 150, 300, [
    [15, 30, 135, 45],
    [15, 90, 75, 105],
  ]);
  return { root, project };
}

function run(args, root) {
  const result = spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* left null */
  }
  return { status: result.status, parsed, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

test("measure reports both rasters and the scale between them", () => {
  const { root } = scenario("measure");
  const { status, parsed } = run(
    ["measure", "--project", "demo", "--revision", "revision-001", "--json"],
    root,
  );

  assert.equal(status, 0);
  assert.equal(parsed.reference.width, 100);
  assert.equal(parsed.render.width, 150);
  assert.equal(parsed.scale, 1.5);
  assert.equal(parsed.aspectDrift, 0, "same proportions should drift by nothing");
});

test("several windows resolve in one invocation", () => {
  // The point of the command. 76 separate measurement calls is the failure it
  // was built for, and one window per call would reproduce that with nicer
  // syntax.
  const { root } = scenario("batch");
  const { status, parsed } = run(
    [
      "compare", "--project", "demo", "--revision", "revision-001",
      "--window", "upper,0,100,0,50",
      "--window", "lower,0,100,50,100",
      "--json",
    ],
    root,
  );

  assert.equal(status, 0);
  assert.equal(parsed.windows.length, 2);
  assert.deepEqual(parsed.windows.map((w) => w.name), ["upper", "lower"]);
});

test("compare reports both sides in the units it advertises", () => {
  const { root } = scenario("units");
  const { parsed } = run(
    ["compare", "--project", "demo", "--revision", "revision-001", "--window", "all,0,100,0,100", "--json"],
    root,
  );

  assert.equal(parsed.units, "reference pixels");
  const [window] = parsed.windows;
  assert.ok(window.bandCountMatches);
  // The render's own rows are 30..45. Reported back in reference pixels they are
  // 20..30 again, which is the entire purpose of the command.
  assert.deepEqual(window.reference[0], { y0: 20, y1: 30, height: 10, x0: 10, x1: 90 });
  assert.deepEqual(window.render[0], { y0: 20, y1: 30, height: 10, x0: 10, x1: 90 });
});

test("a window is name,x0,x1,y0,y1 — both x bounds, then both y", () => {
  // The order the usage text claims and the order the scratch compare.py used.
  // Getting it wrong silently would return bands from the wrong part of the page,
  // which reads as a layout defect rather than as a mistyped argument.
  const { root } = scenario("order");
  const { parsed } = run(
    ["bands", "--project", "demo", "--window", "narrow,0,60,50,100", "--json"],
    root,
  );

  assert.deepEqual(parsed.windows[0].window, { x0: 0, x1: 60, y0: 50, y1: 100 });
  // Only the second band (y 60..70, x 10..50) is inside that box.
  assert.equal(parsed.windows[0].bands.length, 1);
  assert.equal(parsed.windows[0].bands[0].y0, 60);
});

test("a malformed window is a usage error, not a silent guess", () => {
  const { root } = scenario("badwindow");
  assert.equal(run(["bands", "--project", "demo", "--window", "missing,1,2,3", "--json"], root).status, 2);
  assert.equal(run(["bands", "--project", "demo", "--window", "nan,a,b,c,d", "--json"], root).status, 2);
});

test("bands and compare refuse to run with no window at all", () => {
  // Scanning a whole page merges columns at overlapping heights into one run.
  // Defaulting to the whole page would answer a question nobody asked.
  const { root } = scenario("nowindow");
  const bands = run(["bands", "--project", "demo", "--json"], root);
  assert.equal(bands.status, 2);
  assert.match(bands.output, /needs at least one --window/);
});

test("compare without a revision says what is missing rather than guessing one", () => {
  const { root } = scenario("norevision");
  const result = run(["compare", "--project", "demo", "--window", "all,0,100,0,100"], root);
  assert.equal(result.status, 2);
  assert.match(result.output, /needs --revision/);
});

test("a project with no reference is refused with a code, not a stack trace", () => {
  const root = tempDir("noref");
  fs.mkdirSync(path.join(root, "projects", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "workspace.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");

  const result = run(["measure", "--project", "demo", "--json"], root);
  assert.equal(result.status, 3);
  assert.match(result.output, /import-reference/);
  assert.doesNotMatch(result.output, /at Object\./, "a stack trace reached the caller");
});

test("an unrendered revision is refused before anything is measured", () => {
  const { root, project } = scenario("norender");
  fs.rmSync(path.join(project, "revisions", "revision-001", "output.png"), { force: true });

  const result = run(
    ["compare", "--project", "demo", "--revision", "revision-001", "--window", "all,0,100,0,100"],
    root,
  );
  assert.equal(result.status, 3);
  assert.match(result.output, /render it first/);
});

test("rules reports positions in pixels as well as page fractions", () => {
  // extractRules works in fractions, which is right for comparing two rasters and
  // useless for saying "the divider is at y 227". Printing only one guarantees
  // somebody converts by hand.
  const { root } = scenario("rules");
  const { status, parsed } = run(["rules", "--project", "demo", "--json"], root);

  assert.equal(status, 0);
  for (const rule of parsed.reference.horizontal) {
    assert.ok(rule.at >= 0 && rule.at <= 1, "`at` should be a page fraction");
    assert.equal(typeof rule.atPixels, "number");
  }
});

test("colors ranks by coverage and the shares are a distribution", () => {
  const { root } = scenario("colors");
  const { status, parsed } = run(["colors", "--project", "demo", "--json"], root);

  assert.equal(status, 0);
  assert.ok(parsed.palette.length > 0);
  const shares = parsed.palette.map((entry) => entry.share);
  assert.deepEqual(shares, [...shares].sort((a, b) => b - a), "not ranked by coverage");
  assert.ok(shares.reduce((a, b) => a + b, 0) <= 1.0001);
});

test("--help exits clean and names every subcommand", () => {
  const result = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  for (const command of ["measure", "rules", "bands", "colors", "compare"]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
});

test("rules reports both sides in ONE coordinate space", () => {
  // The bug this catches shipped once and was caught by reading the output: the
  // render's rule positions were pixels in its OWN raster, printed in a column
  // beside the reference's, looking comparable and differing by the scale — 306
  // against 360 for the same rule. A number that means a different thing than
  // the number beside it is the failure this whole module exists to prevent.
  const { root } = scenario("ruleunits");
  const { parsed } = run(["rules", "--project", "demo", "--revision", "revision-001", "--json"], root);

  assert.equal(parsed.scale, 1.5, "the render is 1.5x the reference");
  assert.equal(
    parsed.reference.horizontal.length,
    parsed.render.horizontal.length,
    "the fixture draws the same bands on both sides",
  );
  for (const [i, referenceRule] of parsed.reference.horizontal.entries()) {
    const renderRule = parsed.render.horizontal[i];
    // Reference pixels on both sides: the same band must land at the same
    // number, not at that number times the scale.
    assert.ok(
      Math.abs(renderRule.atPixels - referenceRule.atPixels) <= 1,
      `rule ${i}: reference ${referenceRule.atPixels} vs render ${renderRule.atPixels} — `
        + "the render side is still in its own pixels",
    );
  }
});
