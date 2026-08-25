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
import {
  computeIterationStatus,
  IterationStatusError,
  measurementEvidence,
} from "../lib/iteration-status.mjs";

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
          ? [{
              id: pass.mismatch,
              severity: "MAJOR",
              reason: "differs",
              action: "fix it",
              ...(pass.rootCause ? { rootCause: pass.rootCause } : {}),
            }]
          : [],
      };
      if (pass.mismatch) review.largestMismatch = pass.mismatch;
      if (pass.reported) review.humanReportedMismatch = pass.reported;
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

test("a broken ancestor makes the iteration count a declared lower bound", () => {
  // Stopping silently at an unreadable ancestor under-counts the loop, which
  // makes every limit more permissive exactly when the project is damaged.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "a" },
    { verdict: "REVISE", mismatch: "b" },
    { verdict: "REVISE", mismatch: "c" },
  ], "truncated");
  fs.rmSync(path.join(dir, "revisions", "revision-002", "revision.json"));

  const status = statusOf(dir);
  assert.equal(status.iterations, 1, "the walk stops at the unreadable ancestor");
  assert.equal(status.iterationsAreLowerBound, true, "the truncation is not reported");
  assert.equal(status.chainTruncatedAt, "revision-002");
  assert.match(status.reasons.join(" "), /LOWER BOUND/);
  assert.match(status.reasons.join(" "), /revision-002/);
});

test("an intact chain does not claim to be a lower bound", () => {
  const status = statusOf(projectWith([{ verdict: "REVISE", mismatch: "a" }], "intact"));
  assert.equal(status.iterationsAreLowerBound, false);
  assert.equal(status.chainTruncatedAt, null);
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

// --------------------------------------------- what the user said comes first

test("a difference the user named outranks the measured largest one", () => {
  // The point of the override: a person saying "the timeline looks wrong" must
  // not lose the next pass to whatever occupies the most pixels.
  const dir = projectWith([
    {
      verdict: "REVISE",
      mismatch: "raster-antialiasing",
      reported: { id: "timeline-marker-placement", quote: "the timeline isn't aligned", addressed: false },
    },
  ], "override");

  const status = statusOf(dir);
  assert.equal(status.largestMismatch, "timeline-marker-placement");
  assert.equal(status.focusSource, "human");
});

test("a report keeps priority until a review marks it addressed", () => {
  const dir = projectWith([
    {
      verdict: "REVISE",
      mismatch: "raster-antialiasing",
      reported: { id: "timeline-marker-placement", quote: "the timeline isn't aligned", addressed: true },
    },
  ], "addressed");

  const status = statusOf(dir);
  assert.equal(status.largestMismatch, "raster-antialiasing", "an addressed report still held the loop");
  assert.equal(status.focusSource, "measured");
});

test("with no report, the measured mismatch leads and says so", () => {
  const dir = projectWith([{ verdict: "REVISE", mismatch: "header-height" }], "measured");
  const status = statusOf(dir);
  assert.equal(status.largestMismatch, "header-height");
  assert.equal(status.focusSource, "measured");
});

// ------------------------------------------------- one root cause per pass

test("three symptoms of one cause count as three attempts at that cause", () => {
  // Counting ids alone would reset the bound every pass and let the loop chase
  // one cause forever, which is exactly what the bound exists to catch.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "rail-overshoot", rootCause: "entry-band-height" },
    { verdict: "REVISE", mismatch: "marker-misaligned", rootCause: "entry-band-height" },
    { verdict: "REVISE", mismatch: "title-drift", rootCause: "entry-band-height" },
  ], "cause");

  const status = statusOf(dir);
  assert.equal(status.sameMismatchAttempts, 3);
  assert.equal(status.rootCause, "entry-band-height");
  assert.equal(status.verdict, "BLOCKED");
});

test("symptoms of different causes are different attempts", () => {
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "rail-overshoot", rootCause: "entry-band-height" },
    { verdict: "REVISE", mismatch: "sidebar-width", rootCause: "column-split" },
  ], "causes");

  const status = statusOf(dir);
  assert.equal(status.sameMismatchAttempts, 1);
  assert.equal(status.verdict, "REVISE");
});

test("without a rootCause the bound still counts by id, as before", () => {
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-height" },
  ], "byid");

  const status = statusOf(dir);
  assert.equal(status.sameMismatchAttempts, 2);
  assert.equal(status.rootCause, null, "a cause was invented where none was recorded");
});

test("blocking on a user's report says so, instead of claiming a repeated attempt", () => {
  // The passes in between may have worked on other things; what survived is
  // the report. Saying "the next attempt would be the same attempt" there is
  // simply untrue, and it is the sentence a human reads when the loop stops.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "a", reported: { id: "timeline", quote: "wrong", addressed: false } },
    { verdict: "REVISE", mismatch: "b", reported: { id: "timeline", quote: "wrong", addressed: false } },
    { verdict: "REVISE", mismatch: "c", reported: { id: "timeline", quote: "wrong", addressed: false } },
  ], "humanblock");

  const status = statusOf(dir);
  assert.equal(status.verdict, "BLOCKED");
  assert.equal(status.focusSource, "human");
  const reason = status.reasons.join(" ");
  assert.match(reason, /what the user reported/);
  assert.match(reason, /stop and ask them/);
  assert.ok(!reason.includes("the same attempt"), "it still claims a repeated attempt");
});

// --- a render nobody compared -------------------------------------------------

/** Put a render, and optionally its comparison, into a revision folder. */
function renderInto(dir, revisionId, { measured }) {
  const revDir = path.join(dir, "revisions", revisionId);
  fs.writeFileSync(path.join(revDir, "output.pdf"), "%PDF");
  if (measured) fs.writeFileSync(path.join(revDir, "visual-diff-stats.json"), '{"mismatchPx":0}');
}

test("a render with no comparison cannot be ready, however good the review looks", () => {
  // Every gate lives inside render-and-diff — the page diff, the footer band,
  // the border topology, the links, the integrity check — so a revision that
  // never called it has passed none of them. A real proposal run reached a
  // seven-mismatch review carrying no diff artifacts at all, and the harness
  // accepted it. Judging the render is judgement; having compared it is not.
  const dir = projectWith([{ verdict: "READY_FOR_APPROVAL" }], "unmeasured");
  renderInto(dir, "revision-001", { measured: false });

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.verdict, "REVISE");
  assert.equal(status.largestMismatch, "unmeasured-render");
  assert.deepEqual(status.measurement, { rendered: true, measured: false });
  assert.ok(
    status.reasons.some((r) => /render and no comparison/.test(r)),
    `the reason was not stated: ${JSON.stringify(status.reasons)}`,
  );
});

test("the same review passes once the comparison is there", () => {
  const dir = projectWith([{ verdict: "READY_FOR_APPROVAL" }], "measured");
  renderInto(dir, "revision-001", { measured: true });

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.verdict, "READY_FOR_APPROVAL");
  assert.deepEqual(status.measurement, { rendered: true, measured: true });
});

test("a revision with nothing rendered is unrendered, not unmeasured", () => {
  // Different state, different next step: there is nothing to compare yet.
  const dir = projectWith([{ verdict: "REVISE", mismatch: "header" }], "unrendered");

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.deepEqual(status.measurement, { rendered: false, measured: false });
  assert.equal(status.largestMismatch, "header", "the real focus was replaced");
});

test("the evidence is any one of the three artifacts a comparison leaves", () => {
  // The stats are what the diff writes and the images are what a reviewer
  // opens; requiring all three would fail a pass that produced a diff image
  // and nothing else.
  const dir = tempDir("evidence");
  fs.mkdirSync(dir, { recursive: true });
  assert.deepEqual(measurementEvidence(dir), { rendered: false, measured: false });

  fs.writeFileSync(path.join(dir, "output.png"), "PNG");
  assert.deepEqual(measurementEvidence(dir), { rendered: true, measured: false });

  fs.writeFileSync(path.join(dir, "reference-scaled.png"), "PNG");
  assert.equal(measurementEvidence(dir).measured, true);
});
