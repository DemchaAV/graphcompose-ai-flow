#!/usr/bin/env node
/**
 * scripts/test/border-topology.test.mjs — a missing divider can be the design.
 *
 * The failure this exists to prevent is a reviewer "improving" a match by
 * drawing a line the reference deliberately omits. A reference that groups two
 * adjacent rows draws nothing between them; counting rows calls that a match and
 * calls the drawn divider progress. Comparing topology calls it what it is.
 *
 * Both directions cost almost nothing in a pixel diff — a hairline among
 * hundreds of thousands of pixels — which is exactly why they need their own
 * measurement rather than a threshold on the existing one.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { compareRules, describe, extractRules } from "../lib/border-topology.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-border-topology.mjs");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

const WIDTH = 200;
const HEIGHT = 400;

/**
 * A white page with black horizontal rules at the given fractions, and
 * optionally a filled band — the thing that is not a rule.
 */
function page({ rules = [], band = null, thickness = 2 } = {}) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data.fill(255);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;

  const paint = (y0, y1) => {
    for (let y = Math.max(0, y0); y < Math.min(HEIGHT, y1); y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const at = (y * WIDTH + x) * 4;
        png.data[at] = 0;
        png.data[at + 1] = 0;
        png.data[at + 2] = 0;
      }
    }
  };
  for (const at of rules) paint(Math.round(at * HEIGHT), Math.round(at * HEIGHT) + thickness);
  if (band) paint(Math.round(band.from * HEIGHT), Math.round(band.to * HEIGHT));
  return png;
}

const horizontalAt = (png) => extractRules(png).horizontal.map((r) => Number(r.at.toFixed(2)));

test("rules are found where they were drawn", () => {
  assert.deepEqual(horizontalAt(page({ rules: [0.25, 0.5, 0.75] })), [0.25, 0.5, 0.75]);
});

test("a filled band is not a rule", () => {
  // The invoice's sage masthead scanned as five missing dividers before this:
  // a fill spans the width exactly as a rule does, and only its thickness tells
  // them apart.
  const withBand = page({ rules: [0.5], band: { from: 0.05, to: 0.3 } });
  assert.deepEqual(horizontalAt(withBand), [0.5]);
  assert.equal(extractRules(withBand).horizontalBands.length, 1, "the band was dropped instead of reported");
});

test("a divider both sides omit is not a finding", () => {
  // The whole point: two adjacent rows grouped on purpose.
  const reference = extractRules(page({ rules: [0.2, 0.8] }));
  const render = extractRules(page({ rules: [0.2, 0.8] }));
  const comparison = compareRules(reference.horizontal, render.horizontal);
  assert.deepEqual(describe("horizontal", comparison), []);
  assert.equal(comparison.matched.length, 2);
});

test("a divider the render lost is named as lost", () => {
  const reference = extractRules(page({ rules: [0.2, 0.5, 0.8] }));
  const render = extractRules(page({ rules: [0.2, 0.8] }));
  const findings = describe("horizontal", compareRules(reference.horizontal, render.horizontal));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "rule-missing-from-render");
  assert.match(findings[0].detail, /a divider was lost, not suppressed/);
});

test("a divider only the render draws is named as the thing breaking the grouping", () => {
  const reference = extractRules(page({ rules: [0.2, 0.8] }));
  const render = extractRules(page({ rules: [0.2, 0.5, 0.8] }));
  const findings = describe("horizontal", compareRules(reference.horizontal, render.horizontal));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "rule-only-in-render");
  assert.match(findings[0].detail, /breaks the grouping/);
});

test("the same rule slightly out of place is displaced, not lost and invented", () => {
  // Two findings with two wrong fixes, where there is one rule and one fix.
  const reference = extractRules(page({ rules: [0.5] }));
  const render = extractRules(page({ rules: [0.515] }));
  const findings = describe("horizontal", compareRules(reference.horizontal, render.horizontal));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "rule-displaced");
  assert.match(findings[0].detail, /the same rule/);
});

test("a rule far from any other is missing, not displaced", () => {
  const reference = extractRules(page({ rules: [0.2] }));
  const render = extractRules(page({ rules: [0.9] }));
  const kinds = describe("horizontal", compareRules(reference.horizontal, render.horizontal)).map((f) => f.kind);
  assert.deepEqual(kinds.sort(), ["rule-missing-from-render", "rule-only-in-render"]);
});

// --- the CLI ------------------------------------------------------------------

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcbt-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function scenario({ label, referenceRules, renderRules, regions }) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");
  fs.mkdirSync(revision, { recursive: true });
  fs.writeFileSync(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
  fs.writeFileSync(
    path.join(project, "template-project.json"),
    JSON.stringify({ projectName: "demo", schemaVersion: 1 }),
    "utf8",
  );
  fs.writeFileSync(path.join(revision, "output.png"), PNG.sync.write(page({ rules: renderRules })));
  fs.writeFileSync(path.join(revision, "reference-scaled.png"), PNG.sync.write(page({ rules: referenceRules })));
  if (regions) {
    fs.writeFileSync(
      path.join(revision, "visual-analysis.json"),
      JSON.stringify({ schemaVersion: 1, page: {}, regions }),
      "utf8",
    );
  }
  return { root, revision };
}

function runCli(root, extra = []) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-001", "--root", root, "--json", ...extra],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* failure path */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout}${spawned.stderr}` };
}

test("the CLI compares the render against the persisted scaled reference", () => {
  const s = scenario({ label: "cli", referenceRules: [0.25, 0.75], renderRules: [0.25, 0.5, 0.75] });
  const { status, parsed } = runCli(s.root);

  assert.equal(status, 0, "findings are evidence for the review, not a gate");
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].kind, "rule-only-in-render");
});

test("--region scopes the scan to that region's bounds", () => {
  // The bottom half only: the rule at 0.25 is outside it and must not be judged.
  const s = scenario({
    label: "region",
    referenceRules: [0.25, 0.9],
    renderRules: [0.25, 0.9],
    regions: [{ id: "lower", label: "Lower block", bounds: { x: 0, y: 0.5, w: 1, h: 0.5 } }],
  });
  const { status, parsed } = runCli(s.root, ["--region", "lower"]);

  assert.equal(status, 0);
  assert.equal(parsed.reference.horizontal, 1, "the scan reached outside the region");
  assert.deepEqual(parsed.findings, []);
});

test("a region with no bounds is refused rather than silently scanned whole-page", () => {
  const s = scenario({
    label: "nobounds",
    referenceRules: [0.5],
    renderRules: [0.5],
    regions: [{ id: "lower", label: "Lower block" }],
  });
  const { status, output } = runCli(s.root, ["--region", "lower"]);
  assert.equal(status, 3);
  assert.match(output, /no bounds/);
});

test("without a diff to have persisted the scaled reference, it says so", () => {
  const s = scenario({ label: "noref", referenceRules: [0.5], renderRules: [0.5] });
  fs.rmSync(path.join(s.revision, "reference-scaled.png"));
  const { status, output } = runCli(s.root);
  assert.equal(status, 3);
  assert.match(output, /reference-scaled\.png/);
  assert.match(output, /render-and-diff/);
});

test("usage errors are usage errors", () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
});

// --- the review knows how to read it ------------------------------------------

test("the review skill tells the reviewer which finding means which fix", () => {
  const skill = fs.readFileSync(
    path.join(repoRoot, "skills", "workflows", "review-template", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /check-border-topology/, "the review never reaches for the tool");
  for (const kind of ["rule-missing-from-render", "rule-only-in-render", "rule-displaced"]) {
    assert.match(skill, new RegExp(kind), `the review does not say what ${kind} means`);
  }
  assert.match(
    skill,
    /no line between them on purpose/i,
    "the review does not say that a missing divider can be the design",
  );
});
