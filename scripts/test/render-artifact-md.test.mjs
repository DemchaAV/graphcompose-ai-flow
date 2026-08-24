#!/usr/bin/env node
/**
 * scripts/test/render-artifact-md.test.mjs — the reading copy is generated,
 * and drift from its JSON is detectable.
 *
 * The bug being prevented is not a crash. Writing an artifact twice — once as
 * canonical JSON, once as prose — let a reviewer reading the Markdown and a
 * gate reading the JSON disagree about the same revision, with nothing to say
 * which was right. The first acceptance run wrote 24 such Markdown files,
 * roughly 29k tokens of restatement, and never reconciled them.
 *
 * So the assertions are about faithfulness and detectability: what the JSON
 * says appears, what it does not say does not appear, and an edited .md fails
 * --check.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "render-artifact-md.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcmd-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Write one artifact into a fresh revision directory and return both paths. */
function artifact(kind, body, label = kind) {
  const dir = tempDir(label);
  const json = path.join(dir, `${kind}.json`);
  fs.writeFileSync(json, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return { dir, json, md: path.join(dir, `${kind}.md`) };
}

const REVIEW = {
  schemaVersion: 1,
  verdict: "REVISE",
  recommendation: "REVISE",
  score: 62,
  iteration: 3,
  comparedAgainst: "reference",
  gate: { kind: "visual-review", passed: false, metric: "mismatchPx 1200, percent 0.9" },
  largestMismatch: "header-height",
  summary: "The header is one line too tall.",
  mismatches: [
    {
      id: "header-height",
      severity: "MAJOR",
      region: "header",
      component: "renderHeader",
      reason: "Two lines where the reference uses one.",
      action: "Tighten the leading.",
      evidence: ["output.png"],
    },
  ],
};

test("the verdict, the quoted metric and the largest mismatch all survive rendering", () => {
  const { json, md } = artifact("visual-review", REVIEW);
  const result = run([json]);
  assert.equal(result.status, 0, result.output);

  const text = fs.readFileSync(md, "utf8");
  assert.match(text, /\*\*Verdict: REVISE\.\*\*/);
  // The contract is that the metric is quoted, never paraphrased.
  assert.match(text, /mismatchPx 1200, percent 0\.9/);
  assert.match(text, /`header-height` \*\*← largest\*\*/);
  assert.match(text, /Tighten the leading\./);
  assert.match(text, /renderHeader/);
});

test("the score is labelled a signal rather than presented as a gate", () => {
  const { json, md } = artifact("visual-review", REVIEW, "score");
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /Pixel similarity signal: 62/);
  assert.match(text, /signal, not a gate/);
});

test("notes are emitted verbatim, which is what keeps narrative out of a second file", () => {
  const { json, md } = artifact(
    "visual-review",
    { ...REVIEW, notes: ["| | ref | rev-2 |\n|---|---|---|\n| rail | 0 px | 7 pt |"] },
    "notes",
  );
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /## Notes/);
  assert.match(text, /\| rail \| 0 px \| 7 pt \|/);
});

test("a field the artifact does not carry produces no empty heading", () => {
  const { json, md } = artifact(
    "visual-review",
    { schemaVersion: 1, verdict: "READY_FOR_APPROVAL", mismatches: [] },
    "sparse",
  );
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /Mismatches \(0\)/);
  assert.ok(!text.includes("## Evidence"), "an empty Evidence section was rendered");
  assert.ok(!text.includes("## Notes"), "an empty Notes section was rendered");
  assert.ok(!text.includes("undefined"), "an absent field leaked as the string undefined");
});

test("a pipe in a value cannot break the table it is rendered into", () => {
  const { json, md } = artifact(
    "visual-review",
    {
      ...REVIEW,
      mismatches: [{ ...REVIEW.mismatches[0], reason: "a | b, and\na newline" }],
    },
    "escape",
  );
  run([json]);
  const text = fs.readFileSync(md, "utf8");
  const row = text.split("\n").find((l) => l.includes("header-height") && l.startsWith("|"));

  assert.ok(row, "the mismatch row is missing");
  assert.match(row, /a \\\| b/);
  assert.ok(!row.includes("\n"), "a newline survived into a table row");
});

test("the region ids an analysis names are all present in the reading copy", () => {
  const { json, md } = artifact("visual-analysis", {
    schemaVersion: 1,
    page: { format: "A4", orientation: "portrait", pageCount: 1 },
    regions: [
      { id: "sidebar", label: "Sidebar", contains: ["avatar"] },
      { id: "main", label: "Main column", contains: ["summary"] },
    ],
    unclearParts: [{ item: "badge glyph", reason: "too small", proposedAssumption: "a trophy" }],
  });
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /`sidebar`/);
  assert.match(text, /`main`/);
  // An unread part of the reference is what a reviewer most needs to see.
  assert.match(text, /## Unclear parts/);
  assert.match(text, /a trophy/);
});

test("the plan's spine — region, render method, primitives — is rendered as a table", () => {
  const { json, md } = artifact("architecture-plan", {
    schemaVersion: 1,
    targetGraphComposeVersion: "2.2.0",
    templateSurface: { lane: "V2 layered", documentKind: "cv" },
    componentMapping: [
      { region: "header", renderMethod: "renderHeader", primitives: ["addParagraph"] },
    ],
  });
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /GraphCompose 2\.2\.0/);
  assert.match(text, /\| region \| render method \| primitives \|/);
  assert.match(text, /`renderHeader`/);
});

test("--check passes on a freshly generated file and fails once it is edited", () => {
  const { json, md } = artifact("visual-review", REVIEW, "check");
  run([json]);

  const clean = run([json, "--check"]);
  assert.equal(clean.status, 0, clean.output);
  assert.match(clean.output, /in sync/);

  fs.appendFileSync(md, "\nAdded by hand.\n", "utf8");
  const dirty = run([json, "--check"]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.output, /drifted/);
  assert.match(dirty.output, /regenerate it, do not edit it/);
});

test("--check reports a missing reading copy rather than passing silently", () => {
  const { json } = artifact("visual-review", REVIEW, "missing");
  const result = run([json, "--check"]);

  assert.equal(result.status, 1);
  assert.match(result.output, /missing/);
});

test("--revision renders every artifact present and ignores the ones that are not", () => {
  const dir = tempDir("revision");
  fs.writeFileSync(path.join(dir, "visual-review.json"), JSON.stringify(REVIEW), "utf8");
  fs.writeFileSync(
    path.join(dir, "visual-analysis.json"),
    JSON.stringify({ schemaVersion: 1, page: { format: "A4" }, regions: [] }),
    "utf8",
  );

  const result = run(["--revision", dir]);
  assert.equal(result.status, 0, result.output);
  assert.ok(fs.existsSync(path.join(dir, "visual-review.md")));
  assert.ok(fs.existsSync(path.join(dir, "visual-analysis.md")));
  assert.ok(
    !fs.existsSync(path.join(dir, "architecture-plan.md")),
    "a reading copy was invented for an artifact that does not exist",
  );
});

test("a file that is not one of the three artifacts is refused", () => {
  const dir = tempDir("unknown");
  const stray = path.join(dir, "notes.json");
  fs.writeFileSync(stray, "{}", "utf8");

  const result = run([stray]);
  assert.equal(result.status, 2);
  assert.match(result.output, /is not one of/);
});

test("malformed JSON is reported as such, not rendered into a misleading page", () => {
  const dir = tempDir("broken");
  const broken = path.join(dir, "visual-review.json");
  fs.writeFileSync(broken, "{ not json", "utf8");

  const result = run([broken]);
  assert.equal(result.status, 1);
  assert.match(result.output, /not valid JSON/);
});

test("every generated file says where it came from", () => {
  const { json, md } = artifact("visual-review", REVIEW, "provenance");
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /Generated from `visual-review\.json`/);
  assert.match(text, /render-artifact-md\.mjs/);
});

test("a user's own words lead the page, above the measured list", () => {
  const { json, md } = artifact(
    "visual-review",
    {
      ...REVIEW,
      humanReportedMismatch: {
        id: "timeline-marker-placement",
        quote: "the timeline visually isn't aligned correctly",
        addressed: false,
      },
      mismatches: [
        { ...REVIEW.mismatches[0], id: "timeline-marker-placement", source: "human" },
      ],
    },
    "reported",
  );
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /\*\*Reported by the user\*\* \(outstanding\)/);
  assert.match(text, /> the timeline visually isn't aligned correctly/);
  assert.match(text, /\*\*← reported\*\*/);
  // Before the table, because it is the first thing a reader needs.
  assert.ok(
    text.indexOf("Reported by the user") < text.indexOf("## Mismatches"),
    "the report was buried below the measured list",
  );
});

test("a shared root cause is rendered, so linked symptoms read as one fix", () => {
  const { json, md } = artifact(
    "visual-review",
    {
      ...REVIEW,
      mismatches: [
        { ...REVIEW.mismatches[0], id: "rail-overshoot", rootCause: "entry-band-height" },
        { ...REVIEW.mismatches[0], id: "title-drift", rootCause: "entry-band-height" },
      ],
    },
    "cause",
  );
  run([json]);
  const text = fs.readFileSync(md, "utf8");

  assert.match(text, /\| id \| severity \| cause \|/);
  assert.ok(
    (text.match(/entry-band-height/g) ?? []).length >= 2,
    "the shared cause did not appear on both rows",
  );
});

test("the renamed signal is used, and the old name still renders", () => {
  const renamed = artifact(
    "visual-review",
    { ...REVIEW, score: undefined, pixelSimilaritySignal: 71 },
    "renamed",
  );
  run([renamed.json]);
  assert.match(fs.readFileSync(renamed.md, "utf8"), /Pixel similarity signal: 71/);

  // A revision written before the rename must still produce a reading copy.
  const legacy = artifact("visual-review", { ...REVIEW, score: 62 }, "legacy");
  run([legacy.json]);
  assert.match(fs.readFileSync(legacy.md, "utf8"), /Pixel similarity signal: 62/);
});

test("--out with --revision is refused rather than writing everything to one file", () => {
  // It used to render each artifact over the last and report success for each,
  // so two of three vanished silently.
  const dir = tempDir("outclash");
  fs.writeFileSync(path.join(dir, "visual-review.json"), JSON.stringify(REVIEW), "utf8");
  fs.writeFileSync(
    path.join(dir, "visual-analysis.json"),
    JSON.stringify({ schemaVersion: 1, page: { format: "A4" }, regions: [] }),
    "utf8",
  );

  const result = run(["--revision", dir, "--out", path.join(dir, "combined.md")]);
  assert.equal(result.status, 2);
  assert.match(result.output, /--out takes one destination/);
  assert.ok(!fs.existsSync(path.join(dir, "combined.md")), "it wrote anyway");
});
