#!/usr/bin/env node
/**
 * scripts/test/pass.test.mjs — one loop pass as two commands and one screen.
 *
 * Renders need Maven, so the render half runs with --skip-render against
 * pre-made PNGs, as render-and-diff's own tests do. What is asserted is the
 * plumbing: --open carries the sources and records the report, a judged
 * revision is refused with the next command in the refusal, and the render
 * screen carries the figure, the loop line and the next step.
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
const CLI = path.join(repoRoot, "scripts", "pass.mjs");
const { PNG } = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"))("pngjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpass-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writePng(file, width, height, value) {
  const png = new PNG({ width, height });
  png.data.fill(value);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** A workspace with one draft revision that has sources and a render. */
function scenario({ reviewed = false, label = "ws" } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    id: "demo",
    displayName: "demo",
    docKind: "cv",
    targetGraphComposeVersion: "2.2.0",
    skillPack: "skills/versions/graphcompose-2.2",
    currentDraftRevisionId: "revision-001",
    currentApprovedRevisionId: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "revision.json"), {
    id: "revision-001",
    parentRevisionId: null,
    status: "DRAFT",
    userRequest: "first",
    targetGraphComposeVersion: "2.2.0",
    skillPack: "skills/versions/graphcompose-2.2",
    createdAt: "2026-08-25T00:00:00.000Z",
    artifacts: { userRequest: "user-request.md" },
    schemaVersion: 1,
  });
  fs.writeFileSync(path.join(revision, "user-request.md"), "# User request\n\nfirst\n");
  fs.writeFileSync(path.join(revision, "GeneratedCvTemplate.java"), "class GeneratedCvTemplate {}\n");
  fs.writeFileSync(path.join(revision, "cv-data.json"), "{}\n");
  writePng(path.join(revision, "output.png"), 124, 175, 200);
  writePng(path.join(project, "reference", "reference.png"), 102, 144, 200);
  if (reviewed) {
    // A judged revision was measured first, or iterate-status would (rightly)
    // call it unmeasured and make that the focus.
    writeJson(path.join(revision, "visual-diff-stats.json"), {
      mismatchPx: 1200,
      percent: 5.5,
      reference: path.join(revision, "reference-scaled.png"),
    });
    writePng(path.join(revision, "reference-scaled.png"), 124, 175, 200);
    writeJson(path.join(revision, "visual-review.json"), {
      schemaVersion: 1,
      verdict: "REVISE",
      largestMismatch: "header-height",
      mismatches: [{ id: "header-height", severity: "MAJOR", reason: "r", action: "reduce the header padding" }],
    });
  }
  return { root, project, revision };
}

function runPass(root, extra) {
  const spawned = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root, ...extra], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text */
  }
  return { status: spawned.status, parsed, stdout: spawned.stdout ?? "", stderr: spawned.stderr ?? "" };
}

test("--open opens the next revision with the sources carried, records the report, and says what to edit", () => {
  const s = scenario({ reviewed: true, label: "open" });
  const { status, stdout } = runPass(s.root, ["--open", "fix the header", "--report", "the header looks too tall"]);
  assert.equal(status, 0, stdout);
  assert.match(stdout, /opened revision-002 from revision-001, 2 source file\(s\) carried forward/);
  assert.match(stdout, /report\s+"the header looks too tall"/);
  assert.match(stdout, /aimed at\s+"header-height"/);
  assert.match(stdout, /next: edit the one owning property in .*GeneratedCvTemplate\.java.*then: node scripts\/pass\.mjs --project demo/);

  const next = path.join(s.project, "revisions", "revision-002");
  assert.ok(fs.existsSync(path.join(next, "GeneratedCvTemplate.java")));
  assert.ok(fs.existsSync(path.join(next, "cv-data.json")));
  assert.ok(!fs.existsSync(path.join(next, "output.png")), "the parent's render must not travel");
  assert.ok(!fs.existsSync(path.join(next, "visual-review.json")), "the parent's review must not travel");
  const report = JSON.parse(fs.readFileSync(path.join(next, "human-report.json"), "utf8"));
  assert.equal(report.quote, "the header looks too tall");
  assert.equal(report.addressed, false);
});

test("--open --json carries the same facts as data", () => {
  const s = scenario({ reviewed: true, label: "open-json" });
  const { status, parsed } = runPass(s.root, ["--open", "fix the header", "--json"]);
  assert.equal(status, 0);
  assert.equal(parsed.opened, "revision-002");
  assert.equal(parsed.parent, "revision-001");
  assert.equal(parsed.carriedFiles, 2);
  assert.equal(parsed.aimedAt.focus, "header-height");
  assert.deepEqual(parsed.sources.sort(), ["GeneratedCvTemplate.java", "cv-data.json"]);
});

test("a judged revision is refused, with both ways forward in the refusal", () => {
  const s = scenario({ reviewed: true, label: "judged" });
  const { status, stderr } = runPass(s.root, []);
  assert.equal(status, 2);
  assert.match(stderr, /already carries a visual-review\.json/);
  assert.match(stderr, /--open/);
  assert.match(stderr, /--skip-render/);
});

test("a render pass prints one screen and exits with render-and-diff's verdict", () => {
  const s = scenario({ reviewed: false, label: "render" });
  const { status, stdout } = runPass(s.root, ["--skip-render"]);
  assert.equal(status, 2, stdout);
  assert.match(stdout, /^pass\s+demo \/ revision-001/m);
  assert.match(stdout, /diff\s+\d+\.\d{3}% \(\d+ px\) — \w+ vs reference/);
  assert.match(stdout, /checks\s+/);
  assert.match(stdout, /loop\s+REVISE — focus "awaiting-review"/);
  assert.match(stdout, /next: measured, not yet judged/);
  assert.ok(fs.existsSync(path.join(s.revision, "attempts.json")), "the pass was not recorded as an attempt");
});

test("--json returns the pass, the attempt summary and the next step as data", () => {
  const s = scenario({ reviewed: false, label: "render-json" });
  const { status, parsed } = runPass(s.root, ["--skip-render", "--json"]);
  assert.equal(status, 2);
  assert.equal(parsed.revision, "revision-001");
  assert.equal(parsed.pass.loop.focus, "awaiting-review");
  assert.equal(parsed.pass.attempt.n, 1);
  assert.equal(parsed.pass.attempt.rendered, false);
  assert.match(parsed.next, /visual-review\.json/);
});

test("with a review in place, --skip-render re-measures and reports the loop's budget and what was tried", () => {
  const s = scenario({ reviewed: true, label: "remeasure" });
  const { status, stdout } = runPass(s.root, ["--skip-render"]);
  assert.equal(status, 2, stdout);
  assert.match(stdout, /loop\s+REVISE — focus "header-height" \(measured\) · iterations 1\/8 · same cause 1\/3/);
  assert.match(stdout, /next: fix "header-height"/);
});
