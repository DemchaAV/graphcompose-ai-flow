#!/usr/bin/env node
/**
 * scripts/test/iteration-status.test.mjs — the loop bounds, exercised on
 * synthetic revision chains.
 *
 * These build the chains by hand rather than driving a real create flow,
 * because what is under test is the arithmetic: given these revisions and these
 * reviews, does the loop get to continue? Whether an agent actually keeps
 * looping is a question for an interactive session — see
 * docs/private/acceptance-claude.md.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadPipelineConfig } from "../lib/pipeline-config.mjs";
import { computeIterationStatus, IterationStatusError } from "../lib/iteration-status.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = loadPipelineConfig({ repoRoot });

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcloop-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/**
 * Build a project whose revisions are described by `passes`, oldest first.
 * Each pass: { verdict?, mismatch?, status?, failure?, approved? }
 */
function projectWith(passes, label = "loop") {
  const dir = tempDir(label);
  fs.mkdirSync(path.join(dir, "revisions"), { recursive: true });

  let parent = null;
  let lastId = null;
  passes.forEach((pass, index) => {
    const id = `revision-${String(index + 1).padStart(3, "0")}`;
    const revDir = path.join(dir, "revisions", id);
    fs.mkdirSync(revDir, { recursive: true });

    const revision = {
      id,
      parentRevisionId: parent,
      status: pass.status ?? "DRAFT",
      userRequest: `pass ${index + 1}`,
      targetGraphComposeVersion: "1.9.0",
      skillPack: "skills/versions/graphcompose-1.9",
      createdAt: "2026-08-24T00:00:00.000Z",
      artifacts: { userRequest: "user-request.md" },
      schemaVersion: 1,
    };
    if (pass.failure) revision.failure = pass.failure;
    fs.writeFileSync(path.join(revDir, "revision.json"), JSON.stringify(revision, null, 2));

    if (pass.verdict) {
      const review = {
        schemaVersion: 1,
        verdict: pass.verdict,
        mismatches: pass.mismatch
          ? [{ id: pass.mismatch, severity: "MAJOR", reason: "differs", action: "fix it" }]
          : [],
      };
      if (pass.mismatch) review.largestMismatch = pass.mismatch;
      if (pass.failureCategory) review.failureCategory = pass.failureCategory;
      fs.writeFileSync(path.join(revDir, "visual-review.json"), JSON.stringify(review, null, 2));
    }

    parent = id;
    lastId = id;
  });

  fs.writeFileSync(
    path.join(dir, "template-project.json"),
    JSON.stringify({ displayName: label, currentDraftRevisionId: lastId, currentApprovedRevisionId: null }, null, 2),
  );
  return dir;
}

const statusOf = (projectDir, revisionId = null) =>
  computeIterationStatus({ projectDir, config, revisionId });

test("a converging loop keeps its licence to continue, then reports ready", () => {
  // The scenario the plan asks for: a deliberately wrong first pass, two
  // autonomous iterations, then parity.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "sidebar-width" },
    { verdict: "READY_FOR_APPROVAL" },
  ], "converging");

  const midway = statusOf(dir, "revision-002");
  assert.equal(midway.verdict, "REVISE");
  assert.equal(midway.iterations, 2);
  assert.equal(midway.sameMismatchAttempts, 1, "different mismatches must not count as repeats");

  const final = statusOf(dir);
  assert.equal(final.verdict, "READY_FOR_APPROVAL");
  assert.equal(final.iterations, 3);
  assert.equal(final.failureCategory, null);
});

test("the same mismatch three times is BLOCKED, not a fourth attempt", () => {
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-height" },
  ], "stuck");

  const status = statusOf(dir);
  assert.equal(status.verdict, "BLOCKED");
  assert.equal(status.failureCategory, "VISUAL_MISMATCH");
  assert.equal(status.sameMismatchAttempts, 3);
  assert.match(status.reasons.join(" "), /header-height/);
});

test("renaming a surviving mismatch does not buy another attempt — but is visible", () => {
  // Three passes at the same problem under three names look like progress to
  // the counter. The counter cannot catch it; the reason it cannot is why the
  // skills insist ids stay stable.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-too-tall" },
    { verdict: "REVISE", mismatch: "header-padding" },
  ], "renamed");

  const status = statusOf(dir);
  assert.equal(status.sameMismatchAttempts, 1);
  assert.equal(status.verdict, "REVISE");
  // The chain still records all three, so the rename is auditable after the fact.
  assert.deepEqual(status.chain.map((c) => c.mismatch), [
    "header-height",
    "header-too-tall",
    "header-padding",
  ]);
});

test("three build failures in a row are BLOCKED with BUILD_FAILED", () => {
  const failure = { stage: "compile", summary: "javac exit 1", category: "BUILD_FAILED" };
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { status: "FAILED", failure },
    { status: "FAILED", failure },
    { status: "FAILED", failure },
  ], "broken");

  const status = statusOf(dir);
  assert.equal(status.verdict, "BLOCKED");
  assert.equal(status.failureCategory, "BUILD_FAILED");
  assert.equal(status.consecutiveBuildFailures, 3);
});

test("a build failure that was recovered from does not count against the loop", () => {
  const failure = { stage: "compile", summary: "javac exit 1", category: "BUILD_FAILED" };
  const dir = projectWith([
    { status: "FAILED", failure },
    { status: "FAILED", failure },
    { verdict: "REVISE", mismatch: "header-height" },
  ], "recovered");

  const status = statusOf(dir);
  assert.equal(status.consecutiveBuildFailures, 0, "the run is trailing, not cumulative");
  assert.equal(status.verdict, "REVISE");
});

test("hitting the iteration limit blocks with ITERATION_LIMIT", () => {
  const passes = Array.from({ length: config.limits.maxIterations }, (_, i) => ({
    verdict: "REVISE",
    // Distinct ids, so this blocks on the iteration count and nothing else.
    mismatch: `mismatch-${i + 1}`,
  }));
  const status = statusOf(projectWith(passes, "exhausted"));
  assert.equal(status.verdict, "BLOCKED");
  assert.equal(status.failureCategory, "ITERATION_LIMIT");
  assert.equal(status.remaining.iterations, 0);
});

test("parity reached on the last allowed pass is READY, not BLOCKED", () => {
  const passes = Array.from({ length: config.limits.maxIterations - 1 }, (_, i) => ({
    verdict: "REVISE",
    mismatch: `mismatch-${i + 1}`,
  }));
  passes.push({ verdict: "READY_FOR_APPROVAL" });

  const status = statusOf(projectWith(passes, "just-in-time"));
  assert.equal(status.iterations, config.limits.maxIterations);
  assert.equal(
    status.verdict,
    "READY_FOR_APPROVAL",
    "a loop that succeeded on its last allowed pass must not be punished for it",
  );
});

test("an approved ancestor resets the loop", () => {
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "a" },
    { verdict: "REVISE", mismatch: "b" },
    { verdict: "READY_FOR_APPROVAL", status: "APPROVED" },
    { verdict: "REVISE", mismatch: "c" },
  ], "reset");

  const status = statusOf(dir);
  assert.equal(status.iterations, 1, "work after an approval starts a fresh loop");
  assert.equal(status.verdict, "REVISE");
});

test("a render with no review is called out rather than assumed fine", () => {
  const dir = projectWith([{ verdict: "REVISE", mismatch: "header-height" }, {}], "no-review");
  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.match(status.reasons.join(" "), /no visual-review\.json/);
});

test("a missing project or revision is an error, not a silent zero", () => {
  assert.throws(() => statusOf(tempDir("empty")), IterationStatusError);
  const dir = projectWith([{ verdict: "REVISE", mismatch: "a" }], "missing");
  assert.throws(() => statusOf(dir, "revision-999"), IterationStatusError);
});

test("the CLI exits 0 / 2 / 3 for ready / revise / blocked", () => {
  const cli = path.join(repoRoot, "scripts", "iterate-status.mjs");
  const run = (projectDir, projectId) => {
    // The workspace resolver expects <root>/projects/<id>, so lay one out.
    const root = tempDir("ws");
    const projects = path.join(root, "graphcompose-flow", "projects");
    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(
      path.join(root, "graphcompose-flow", "flow.config.json"),
      JSON.stringify({ schemaVersion: 1 }, null, 2),
    );
    fs.cpSync(projectDir, path.join(projects, projectId), { recursive: true });
    try {
      execFileSync(process.execPath, [cli, projectId, "--root", root, "--json"], { stdio: "pipe" });
      return 0;
    } catch (err) {
      return err.status;
    }
  };

  assert.equal(run(projectWith([{ verdict: "READY_FOR_APPROVAL" }], "cli-ready"), "ready"), 0);
  assert.equal(run(projectWith([{ verdict: "REVISE", mismatch: "a" }], "cli-revise"), "revise"), 2);
  assert.equal(
    run(
      projectWith(
        [
          { verdict: "REVISE", mismatch: "a" },
          { verdict: "REVISE", mismatch: "a" },
          { verdict: "REVISE", mismatch: "a" },
        ],
        "cli-blocked",
      ),
      "blocked",
    ),
    3,
  );
});
