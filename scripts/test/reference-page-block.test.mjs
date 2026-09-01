#!/usr/bin/env node
/**
 * scripts/test/reference-page-block.test.mjs — the page block is assembled, not
 * transcribed.
 *
 * ## What this replaces
 *
 * `visual-analysis.json` requires a `page` block with `referencePx`, `aspect`,
 * `sizePt`, `sizeSource` and `format`. Every one of those was already decided by
 * `import-reference` and written to `template-project.json` as
 * `referenceGeometry` — and the geometry subagent was asked to re-derive them by
 * hand: rename four fields, invert the aspect, produce two more.
 *
 * It did not go well. Of nineteen recorded runs, thirteen wrote a `page` block
 * that failed the schema, and the commonest shape of the failure was the
 * information being present as prose inside `format` — "US Letter (reference
 * raster is 1103x1426, aspect 0.773)" — rather than in the fields that carry it.
 *
 * So `analyze` emits the block ready to copy, and these hold it to the schema
 * that consumes it. A block that validates here is a block the geometry
 * subagent cannot get wrong by retyping.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
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
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpage-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

function writePng(file, width, height) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** What import-reference records for an A4 reference it measured itself. */
const A4_GEOMETRY = {
  schemaVersion: 1,
  tolerancePercent: 1,
  aspect: 1.41556,
  orientation: "portrait",
  pages: [{ page: 1, file: "reference/reference.png", widthPx: 1054, heightPx: 1492, aspect: 1.41556 }],
  candidates: [
    { name: "A4", orientation: "portrait", widthPt: 595.276, heightPt: 841.89, aspect: 1.41429, deviationPercent: 0.09 },
  ],
  verdict: "matched",
  pageSize: {
    source: "measured-standard",
    format: "A4",
    orientation: "portrait",
    widthPt: 595.276,
    heightPt: 841.89,
    deviationPercent: 0.09,
  },
  measuredAt: "2026-09-01T00:00:00.000Z",
};

function workspace(label, { geometry = A4_GEOMETRY } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    id: "demo",
    displayName: "demo",
    docKind: "cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    currentDraftRevisionId: null,
    currentApprovedRevisionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    schemaVersion: 1,
    ...(geometry ? { referenceGeometry: geometry } : {}),
  });
  // Small, because analyze measures it and nothing here asserts about the ink.
  writePng(path.join(project, "reference", "reference.png"), 106, 150);
  return root;
}

function analyze(root) {
  const run = spawnSync(process.execPath, [CLI, "analyze", "--project", "demo", "--root", root, "--json"], {
    encoding: "utf8",
  });
  let payload = null;
  try {
    payload = JSON.parse(run.stdout);
  } catch {
    /* an error path */
  }
  return { status: run.status, payload, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

/** The schema's own `page` subschema, so this cannot drift from the consumer. */
function pageValidator() {
  const require = createRequire(import.meta.url);
  const Ajv = require(path.join(repoRoot, ".github", "scripts", "node_modules", "ajv", "dist", "2020.js")).default;
  const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", "visual-analysis.schema.json"), "utf8"));
  return new Ajv({ strict: false, allErrors: true }).compile({ ...schema.properties.page, $schema: undefined });
}

test("the emitted page block validates against the schema that consumes it", () => {
  const { status, payload, out } = analyze(workspace("valid"));

  assert.equal(status, 0, out);
  assert.ok(payload.pageBlock, "analyze emitted no page block");

  const validate = pageValidator();
  assert.ok(
    validate(payload.pageBlock),
    `the block analyze offers does not satisfy the schema: ${JSON.stringify(validate.errors)}`,
  );
});

test("every field comes from what import-reference already decided", () => {
  // Nothing is derived here, and nothing is guessed. If a value in the block is
  // not traceable to referenceGeometry, something started inventing.
  const { payload } = analyze(workspace("traceable"));

  assert.deepEqual(payload.pageBlock, {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1054, height: 1492 },
    aspect: 1.41556,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  });
});

test("the aspect is the schema's, not the measurement's", () => {
  // The trap this removes. `page.aspect` from the raster is width/height —
  // 0.706 for A4 — while the schema wants height/width. A subagent copying the
  // measured number into the schema's field records a portrait page as
  // landscape-shaped, and nothing downstream would question it.
  const { payload } = analyze(workspace("aspect"));

  assert.ok(payload.pageBlock.aspect > 1, "the block carries the raster's aspect, not the schema's");
  assert.ok(payload.page.aspect < 1, "the measurement stopped reporting width/height");
});

test("a project with no recorded geometry gets null, not an invented block", () => {
  // The honest answer when import-reference recorded nothing — which is the
  // state twelve of the nineteen corpus projects are in. Offering a block
  // assembled from guesses would be worse than offering none.
  const { status, payload } = analyze(workspace("no-geometry", { geometry: null }));

  assert.equal(status, 0, "a missing record is not an error; the rest of analyze still answers");
  assert.equal(payload.pageBlock, null);
  assert.ok(payload.page, "the raw measurement is still reported");
});

/** What the record looks like after a person answered the page-size question. */
const CONFIRMED_GEOMETRY = {
  ...A4_GEOMETRY,
  aspect: 1.125,
  pages: [{ page: 1, file: "reference/reference.png", widthPx: 800, heightPx: 900, aspect: 1.125 }],
  verdict: "ask",
  pageSize: {
    source: "user-confirmed-standard",
    format: "LETTER",
    orientation: "portrait",
    widthPt: 612,
    heightPt: 792,
    deviationPercent: 13.07,
    decision: "Asked: LETTER or the measured 612x688.5? Answered: LETTER, the shot is cropped.",
    decidedAt: "2026-09-01T00:00:00.000Z",
  },
};

test("a size a person confirmed carries the sentence the schema asks for", () => {
  // The schema requires sizeDecision exactly when sizeSource is user-confirmed,
  // and the first version of this block omitted it — invalid in the one case a
  // subagent has least to go on, which is how a helper meant to remove
  // guesswork would have reintroduced it. page-size.mjs --decision is where the
  // sentence was captured; it is carried, not re-asked.
  const { payload } = analyze(workspace("confirmed", { geometry: CONFIRMED_GEOMETRY }));

  assert.equal(payload.pageBlock.sizeSource, "user-confirmed-standard");
  assert.match(payload.pageBlock.sizeDecision, /Answered: LETTER/);

  const validate = pageValidator();
  assert.ok(
    validate(payload.pageBlock),
    `a confirmed size produced an invalid block: ${JSON.stringify(validate.errors)}`,
  );
});

test("a measured size carries no decision sentence, because nobody was asked", () => {
  const { payload } = analyze(workspace("measured-no-decision"));

  assert.equal(payload.pageBlock.sizeSource, "measured-standard");
  assert.equal(payload.pageBlock.sizeDecision, undefined, "a sentence was invented for a question never asked");
});
