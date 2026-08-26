#!/usr/bin/env node
/**
 * scripts/test/page-size.test.mjs — the page size survives past the import.
 *
 * `import-reference` measures the page and asks when the measurement is not
 * conclusive. That covers the moment a project is created and nothing else: a
 * revision does not re-import, a project made before the measurement existed
 * carries no geometry at all, and the import asked without anything recording
 * the answer — so every later revision would have had to ask again.
 *
 * What is pinned here: an unanswered page size is exit 5 wherever it is asked
 * about, an answered one is exit 0 and stays answered, and the answer cannot be
 * recorded without saying what was asked.
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
const CLI = path.join(repoRoot, "scripts", "page-size.mjs");
const IMPORT_CLI = path.join(repoRoot, "scripts", "import-reference.mjs");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

const DECISION =
  "Nearest standard was LETTER at 1.08%; the user said the source is a rescaled Letter page.";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcps-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function writePng(file, width, height) {
  const png = new PNG({ width, height });
  png.data.fill(180);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}

/** A workspace whose project already has a reference of the given size. */
function workspace(label, { width = 595, height = 842, pages = 1 } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  fs.mkdirSync(path.join(project, "reference"), { recursive: true });
  fs.writeFileSync(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
  // Deliberately without referenceGeometry: this is a project as it looked
  // before the page was ever measured, which is the case that has to work.
  fs.writeFileSync(
    path.join(project, "template-project.json"),
    JSON.stringify({ projectName: "demo", referenceImage: "reference/reference.png", schemaVersion: 1 }, null, 2),
    "utf8",
  );
  writePng(path.join(project, "reference", "reference.png"), width, height);
  for (let page = 2; page <= pages; page += 1) {
    writePng(path.join(project, "reference", `reference-page-${page}.png`), width, height);
  }
  return { host, root, project };
}

function run(root, extra, { json = true } = {}) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--root", root, "--project", "demo", ...(json ? ["--json"] : []), ...extra],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text or failure */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

const projectOf = (ws) =>
  JSON.parse(fs.readFileSync(path.join(ws.project, "template-project.json"), "utf8"));

test("a project that predates the measurement is measured on the spot", () => {
  const ws = workspace("legacy");
  const { status, parsed } = run(ws.root, []);

  assert.equal(status, 0);
  assert.equal(parsed.settled, true);
  assert.equal(parsed.pageSize.format, "A4");
  assert.equal(parsed.pageSize.source, "measured-standard");
  // And it is written down, so the next reader is not measuring again.
  assert.equal(projectOf(ws).referenceGeometry.pageSize.format, "A4");
});

test("an unanswered page size is exit 5 on the revise path too, not just at import", () => {
  const ws = workspace("unanswered", { width: 589, height: 754 });
  const { status, parsed } = run(ws.root, []);

  assert.equal(status, 5);
  assert.equal(parsed.settled, false);
  assert.equal(parsed.pageSize, null);
  assert.ok(parsed.question.includes("DocumentPageSize.of("));
  assert.equal(parsed.candidates[0].name, "LETTER");
});

test("an unanswered measurement is recorded without inventing an answer", () => {
  const ws = workspace("unanswered-record", { width: 589, height: 754 });
  run(ws.root, []);

  const geometry = projectOf(ws).referenceGeometry;
  assert.equal(geometry.verdict, "ask");
  assert.equal(geometry.pages[0].widthPx, 589);
  assert.equal(
    geometry.pageSize,
    undefined,
    "measuring is not deciding — a recorded measurement must not read as a settled size",
  );
});

test("recording the user's answer settles it, and it stays settled", () => {
  const ws = workspace("answer", { width: 589, height: 754 });
  assert.equal(run(ws.root, []).status, 5);

  const recorded = run(ws.root, ["--use", "LETTER", "--decision", DECISION]);
  assert.equal(recorded.status, 0);
  assert.equal(recorded.parsed.pageSize.source, "user-confirmed-standard");
  assert.equal(recorded.parsed.pageSize.format, "LETTER");
  assert.equal(recorded.parsed.pageSize.decision, DECISION);

  // The next revision must not ask again: a question asked repeatedly is a
  // question that gets answered carelessly.
  const again = run(ws.root, []);
  assert.equal(again.status, 0);
  assert.equal(again.parsed.pageSize.decision, DECISION);
  // The measurement is still there beside the decision — the verdict is what
  // the pixels said and does not change because someone answered.
  assert.equal(projectOf(ws).referenceGeometry.verdict, "ask");
});

test("a custom size is recorded as custom, with the numbers the user gave", () => {
  const ws = workspace("custom", { width: 589, height: 754 });
  const { status, parsed } = run(ws.root, [
    "--use",
    "612x783.446",
    "--decision",
    "The user said the source is genuinely custom, not a cropped Letter page.",
  ]);

  assert.equal(status, 0);
  assert.equal(parsed.pageSize.source, "user-confirmed-custom");
  assert.equal(parsed.pageSize.format, "CUSTOM");
  assert.equal(parsed.pageSize.widthPt, 612);
  assert.equal(parsed.pageSize.heightPt, 783.446);
  assert.equal(parsed.pageSize.orientation, "portrait");
});

test("a standard chosen for a landscape reference resolves to the turned page", () => {
  // Otherwise the caller has to remember to turn it, and a portrait A4 recorded
  // against a landscape reference is the original defect wearing a decision.
  const ws = workspace("landscape", { width: 1000, height: 690 });
  const { status, parsed } = run(ws.root, [
    "--use",
    "A4",
    "--decision",
    "The user confirmed the landscape reference is a turned A4, not a custom page.",
  ]);

  assert.equal(status, 0);
  assert.equal(parsed.pageSize.orientation, "landscape");
  assert.ok(
    parsed.pageSize.widthPt > parsed.pageSize.heightPt,
    `expected a turned page, got ${parsed.pageSize.widthPt}x${parsed.pageSize.heightPt}`,
  );
});

test("an answer cannot be recorded without saying what was asked", () => {
  const ws = workspace("no-decision", { width: 589, height: 754 });

  assert.equal(run(ws.root, ["--use", "LETTER"]).status, 2, "accepted a decision with no reason");
  assert.equal(
    run(ws.root, ["--use", "LETTER", "--decision", "ok"]).status,
    2,
    'accepted "ok" as the record of a choice that is not recoverable from the numbers',
  );
  assert.equal(
    projectOf(ws).referenceGeometry?.pageSize,
    undefined,
    "a refused decision must not be half-written",
  );
});

test("a size that is not a size is a usage error, not a page", () => {
  const ws = workspace("bad-size", { width: 589, height: 754 });
  for (const bad of ["A5", "wide", "0x100", "612x"]) {
    assert.equal(
      run(ws.root, ["--use", bad, "--decision", DECISION]).status,
      2,
      `accepted "${bad}" as a page size`,
    );
  }
});

test("a plain read does not touch the file it read from", () => {
  const ws = workspace("read-only");
  run(ws.root, []); // first call measures and writes
  const before = projectOf(ws).updatedAt;

  run(ws.root, []);
  assert.equal(projectOf(ws).updatedAt, before, "answering a question rewrote the project file");
});

test("a project with no reference says so rather than guessing a page", () => {
  const ws = workspace("no-reference");
  fs.rmSync(path.join(ws.project, "reference", "reference.png"));

  const { status, output } = run(ws.root, []);
  assert.equal(status, 4);
  assert.match(output, /import-reference/);
});

test("every page of a multi-page reference is measured, not just page one", () => {
  const ws = workspace("multi", { pages: 3 });
  const { status, parsed } = run(ws.root, []);
  assert.equal(status, 0);
  assert.equal(parsed.settled, true);
  assert.equal(projectOf(ws).referenceGeometry.pages.length, 3);
});

test("re-importing a different reference drops the old decision", () => {
  // A new reference is a new page. Carrying a decision about the old one across
  // would be a settled page size that nobody settled — silently, which is the
  // failure mode this whole change exists to remove.
  const ws = workspace("reimport", { width: 589, height: 754 });
  run(ws.root, ["--use", "LETTER", "--decision", DECISION]);
  assert.equal(projectOf(ws).referenceGeometry.pageSize.source, "user-confirmed-standard");

  const replacement = writePng(path.join(ws.host, "replacement.png"), 595, 842);
  spawnSync(
    process.execPath,
    [IMPORT_CLI, "--root", ws.root, "--project", "demo", "--file", replacement, "--json"],
    { encoding: "utf8" },
  );

  const geometry = projectOf(ws).referenceGeometry;
  assert.equal(geometry.pageSize.source, "measured-standard", "a stale decision survived a re-import");
  assert.equal(geometry.pageSize.decision, undefined);
  assert.equal(geometry.pages[0].widthPx, 595);
});

test("--decision without --use is refused rather than silently ignored", () => {
  const ws = workspace("stray-decision");
  assert.equal(run(ws.root, ["--decision", DECISION]).status, 2);
});

test("--use cannot settle an inconsistent measurement, however confident the decision", () => {
  // `inconsistent` means the pages disagree with each other by more than
  // tolerance — mixed-dpi rasterisation, or pages from two documents. A
  // document has one page size, so there is nothing for a decision to confirm,
  // and recording one anyway exits 0 and silences the question permanently for
  // every later revision, including revise-template's step 0.
  const ws = workspace("inconsistent-use", { width: 595, height: 842, pages: 2 });
  // Make page 2 a different shape, which is what an inconsistent import is.
  writePng(path.join(ws.project, "reference", "reference-page-2.png"), 595, 700);

  const measured = run(ws.root, []);
  assert.equal(measured.parsed.verdict, "inconsistent", measured.output);
  assert.equal(measured.status, 5);

  const forced = run(ws.root, ["--use", "A4", "--decision", DECISION]);
  assert.notEqual(forced.status, 0, "an inconsistent measurement was settled by --use");
  assert.match(forced.output, /pages disagree|inconsistent/i);

  // And the refusal must not have written a pageSize on the way out.
  const project = JSON.parse(
    fs.readFileSync(path.join(ws.project, "template-project.json"), "utf8"),
  );
  assert.equal(project.referenceGeometry?.pageSize ?? null, null);

  // The question is still being asked afterwards.
  assert.equal(run(ws.root, []).status, 5);
});
