#!/usr/bin/env node
/**
 * scripts/test/reference-analyze.test.mjs — the questions a first pass always
 * has, answered in one call.
 *
 * A create run reached authoring after about ninety measuring calls, and the
 * first dozen were invariably the same: how big is the page, where does the ink
 * start, what colours are in it, where are the rules, is it one column or two,
 * what is the vertical rhythm. None of those needs a window chosen by anyone,
 * which is what made them collapsible.
 *
 * The columns are tested through `inkColumns` directly, on images built here,
 * so the assertions are about the arithmetic rather than about whichever
 * reference happens to sit in examples/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { inkBands, inkColumns } from "../lib/reference-metrics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

/** A white page with black rectangles painted on it. */
function page(width, height, rectangles) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (const [x0, y0, x1, y1] of rectangles) {
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
  return png;
}

test("two blocks with a wide gap between them are two columns", () => {
  const image = page(200, 100, [[10, 10, 60, 90], [120, 10, 190, 90]]);
  const columns = inkColumns(image);

  assert.equal(columns.length, 2);
  assert.deepEqual(
    columns.map((c) => [c.x0, c.x1]),
    [[10, 60], [120, 190]],
  );
  assert.equal(columns[0].inkPeak, 80, "the taller column's ink height is reported");
});

test("word spacing is not a column boundary", () => {
  // Two blocks 6px apart: narrower than the gutter tolerance, so one column.
  const image = page(200, 100, [[10, 10, 60, 90], [66, 10, 120, 90]]);
  assert.equal(inkColumns(image).length, 1);
});

test("the gutter tolerance is the knob, and it is honoured", () => {
  const image = page(200, 100, [[10, 10, 60, 90], [66, 10, 120, 90]]);
  assert.equal(inkColumns(image, undefined, { gap: 3 }).length, 2, "a narrower gutter was ignored");
});

test("an empty page has no columns rather than one of width zero", () => {
  assert.deepEqual(inkColumns(page(50, 50, [])), []);
});

test("bands inside one column separate what a whole-page scan merges", () => {
  // Two columns, each with two paragraphs at different heights. Scanned whole,
  // every row carries ink from one side or the other and the page reads as one
  // band; scanned per column, each side reports its own two.
  const image = page(200, 100, [
    [10, 10, 60, 30], [10, 40, 60, 60],
    [120, 20, 190, 50], [120, 70, 190, 90],
  ]);

  const whole = inkBands(image, { x0: 0, y0: 0, x1: 200, y1: 100 });
  const left = inkBands(image, { x0: 10, y0: 0, x1: 60, y1: 100 });
  const right = inkBands(image, { x0: 120, y0: 0, x1: 190, y1: 100 });

  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
  assert.ok(
    whole.length < left.length + right.length,
    `a whole-page scan reported ${whole.length} bands, so it did not merge anything`,
  );
});

test("analyze answers page, palette, rules, columns and bands in one payload", () => {
  // Against a real reference, because the point of the command is that it needs
  // no window and no judgement: whatever is in examples/ must answer.
  const project = "charcoal-gold-cv";
  const reference = path.join(repoRoot, "examples", project, "reference", "reference.png");
  if (!fs.existsSync(reference)) return;

  const { spawnSync } = createRequire(import.meta.url)("node:child_process");
  const run = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "reference.mjs"), "analyze", "--project", project, "--json"],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(run.status, 0, run.stderr);

  const payload = JSON.parse(run.stdout);
  for (const key of ["page", "palette", "rules", "columns", "gutters", "bands"]) {
    assert.ok(payload[key], `analyze answered nothing for ${key}`);
  }
  assert.ok(payload.columns.length >= 1);
  assert.equal(payload.bands.length, payload.columns.length, "bands are reported per column");

  // Bounded on purpose: this replaces a dozen calls and must not cost more than
  // they did. The CV references land near 5 KB.
  assert.ok(
    run.stdout.length < 64 * 1024,
    `analyze returned ${run.stdout.length} bytes, which is a transcript rather than an answer`,
  );
});

test("a column that is inked edge to edge is reported as a panel, not as content", () => {
  // The sidebar case: light type on a filled ground. Darkness cannot separate
  // its lines, and one band spanning the column is not a paragraph.
  const image = page(200, 100, [[0, 0, 60, 100], [120, 20, 190, 50]]);
  const columns = inkColumns(image);
  const filledColumn = columns.find((c) => c.x0 === 0);
  assert.ok(filledColumn, "the filled panel was not detected as a column");

  const bands = inkBands(image, { x0: filledColumn.x0, y0: 0, x1: filledColumn.x1, y1: 100 });
  assert.equal(bands.length, 1);
  assert.equal(bands[0].height, 100, "the panel did not read as one full-height band");
});
