#!/usr/bin/env node
/**
 * scripts/test/visual-analysis-shapes.test.mjs — which disagreements between
 * the schema and a real analysis are the schema's fault, and which are not.
 *
 * ## Why this file exists
 *
 * Nothing validated `visual-analysis.json` until a discovery barrier started
 * doing it, and a month of runs had drifted. Sorting the drift showed two
 * different things wearing the same error message.
 *
 * Some fields are **prose**. `regions[].contains`, `colors[].usedIn`,
 * `page.margins`, `regions[].notes`, the asset candidate lists — a describing
 * author naturally writes one sentence or several, and
 * `render-artifact-md.mjs` renders a string and a list of strings identically.
 * Refusing a run over that was the schema pinning a serialisation nothing
 * downstream could tell apart.
 *
 * Some are **structural**. An `anchor` without `element` and `relatedTo` names
 * nothing and relates it to nothing: it cannot be checked, rebuilt or rolled
 * back. That is not a loose serialisation of an anchor, it is an anchor with
 * the anchor missing, and it stays refused.
 *
 * `layoutProportions` sits with the first group for a reason worth stating: it
 * described how a page divides, with a closed list of the ways a CV divides. A
 * rota has a grid, a contentWidth and a rowHeight, and refusing those was the
 * schema deciding which shapes of document are allowed to exist.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ready, schemaValidator } from "../lib/schema-validator.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Through the shipped validator, on the same Ajv and the same options the
// barrier runs with. The first version compiled its own out of
// `.github/scripts/node_modules`, so this file could go green over a schema the
// barrier would have refused — and went red wherever that directory was, as it
// normally is, empty.
async function validator() {
  assert.ok(await ready(), "tools/schema-validate is not installed; run `npm run setup`");
  return schemaValidator(path.join(repoRoot, "schemas", "visual-analysis.schema.json"));
}

/** The smallest analysis the schema accepts, so a case can vary one field. */
const BASE = {
  schemaVersion: 1,
  page: {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1054, height: 1492 },
    aspect: 1.41556,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  },
  regions: [
    { id: "page-background", label: "Page chrome", page: 1, role: "background", bounds: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  flow: { kind: "fixed", overflowExpectation: "The page is the artifact." },
};

const withRegion = (extra) => ({ ...BASE, regions: [{ ...BASE.regions[0], ...extra }] });

test("a prose field takes one sentence, several, or an explicit none", async () => {
  const validate = await validator();
  for (const [label, value] of [
    ["one sentence", "The painted ground for every sidebar group."],
    ["several", ["The painted ground.", "Full-bleed on three edges."]],
    ["explicitly none", null],
  ]) {
    const contains = validate(withRegion({ contains: value }));
    assert.ok(contains.valid, `contains as ${label}: ${contains.errors}`);
    const notes = validate(withRegion({ notes: value }));
    assert.ok(notes.valid, `notes as ${label}: ${notes.errors}`);
  }
});

test("margins and colour usage are prose too, in both shapes", async () => {
  const validate = await validator();

  const asString = validate({ ...BASE, page: { ...BASE.page, margins: "~7% of page width on both sides." } });
  assert.ok(asString.valid, asString.errors);

  const asList = validate({ ...BASE, page: { ...BASE.page, margins: ["~7% left and right.", "Zero at the foot."] } });
  assert.ok(asList.valid, asList.errors);

  const colors = validate({ ...BASE, colors: [{ role: "accent", value: "#C0703A", usedIn: "rules, dots and dates" }] });
  assert.ok(colors.valid, colors.errors);
});

test("layoutProportions describes the document it has, not the one a CV has", async () => {
  // A rota divides by grid, content width and row height. A closed list of the
  // ways a CV divides made those an error, which is a schema deciding what
  // kinds of document may be analysed.
  const validate = await validator();
  const rota = validate({ ...BASE, layoutProportions: { grid: "7 columns", contentWidth: 0.86, rowHeight: 0.043 } });

  assert.ok(rota.valid, rota.errors);
});

test("an anchor with no element is still refused, because nothing can read it", async () => {
  // The line held on purpose. Everything above is a choice about how to write
  // the same fact down; this is the fact missing.
  const validate = await validator();
  const anchorless = validate({
    ...BASE,
    anchors: [{ relationship: "The week title is flush with the table's right edge." }],
  });

  assert.ok(!anchorless.valid, "an anchor naming no element was accepted");
  assert.match(
    anchorless.errors,
    /element/,
    "the refusal does not say which half of the anchor is missing",
  );
});
