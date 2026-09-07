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
import { ready, schemaValidator } from "../lib/schema-validator.mjs";
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
      // Everything the claim audit reads lives on the review itself, so the
      // tests for it set the fields directly rather than growing a knob per
      // rule on this builder.
      if (pass.review) Object.assign(review, pass.review);
      fs.writeFileSync(path.join(revDir, "visual-review.json"), JSON.stringify(review, null, 2));
    }

    if (pass.stats) {
      // `reference` is how review-claims tells a reference comparison from a
      // parent one, so the fixture has to write a plausible one: inside the
      // revision folder for a reference diff, the parent's render otherwise.
      const comparedImage = pass.statsReferenceInside
        ? path.join(revDir, "reference-scaled.png")
        : path.join(dir, "revisions", "parent", "output.png");
      fs.writeFileSync(
        path.join(revDir, "visual-diff-stats.json"),
        JSON.stringify({ reference: comparedImage, ...pass.stats }, null, 2),
      );
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

test("the same mismatch three times stops the loop, not a fourth attempt", () => {
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-height" },
    { verdict: "REVISE", mismatch: "header-height" },
  ], "stuck");

  const status = statusOf(dir);
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
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

test("hitting the iteration limit stops the loop with ITERATION_LIMIT", () => {
  const passes = Array.from({ length: config.limits.maxIterations }, (_, i) => ({
    verdict: "REVISE",
    // Distinct ids, so this blocks on the iteration count and nothing else.
    mismatch: `mismatch-${i + 1}`,
  }));
  const status = statusOf(projectWith(passes, "exhausted"));
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
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

test("the CLI exits 0 / 2 / 4 for ready / revise / convergence limit", () => {
  // 3 is reserved for BLOCKED, which now means only one thing: no usable
  // document can be produced. A loop that spent its budget on one cause has a
  // document, so it exits 4 - and approve-and-publish lets that through rather
  // than sending an approval around the door that records nothing.
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
        "cli-convergence",
      ),
      "convergence",
    ),
    4,
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
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
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

test("stopping on a user's report says so, instead of claiming a repeated attempt", () => {
  // The passes in between may have worked on other things; what survived is
  // the report. Saying "the next attempt would be the same attempt" there is
  // simply untrue, and it is the sentence a human reads when the loop stops.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "a", reported: { id: "timeline", quote: "wrong", addressed: false } },
    { verdict: "REVISE", mismatch: "b", reported: { id: "timeline", quote: "wrong", addressed: false } },
    { verdict: "REVISE", mismatch: "c", reported: { id: "timeline", quote: "wrong", addressed: false } },
  ], "humanblock");

  const status = statusOf(dir);
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
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

// --------------------------------------------------------------- claims ---
//
// The verdict in visual-review.json used to be the last word. These fix the
// four ways it could contradict the evidence in its own folder and still end
// the loop. The real run that motivated them ended on gate.passed:false with
// verdict READY_FOR_APPROVAL, and every tool downstream agreed.

const REVIEW_READY = { verdict: "READY_FOR_APPROVAL" };

test("READY cannot stand on a binary gate that did not pass", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        gate: { kind: "exact-diff", passed: false, metric: "magick compare -metric AE => 1183" },
      },
    },
  ], "binary-gate");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.deepEqual(
    status.claims.blocking.map((c) => c.id),
    ["binary-gate-failed"],
  );
  // The metric has to survive into the reason, or the next pass is told it
  // failed without being told by how much.
  assert.match(status.reasons.join("\n"), /AE => 1183/);
});

test("a judgement gate is not treated as a measurement", () => {
  // visual-review compares against a rasterised design image: its page
  // percentage is never zero, so blocking on `passed:false` there would make
  // the override a rubber stamp on every reference-built project.
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        gate: { kind: "visual-review", passed: false, metric: "diff: 211583 px (9.734%)" },
      },
    },
  ], "judgement-gate");

  const status = statusOf(dir);
  assert.equal(status.verdict, "READY_FOR_APPROVAL");
  assert.deepEqual(status.claims.blocking, []);
});

test("an override lifts a failed binary gate only when it carries an argument", () => {
  const gate = { kind: "region-diff", passed: false, metric: "AE => 4 outside the changed region" };

  const thin = projectWith([
    { ...REVIEW_READY, review: { gate: { ...gate, override: { reason: "fine" } } } },
  ], "override-thin");
  const thinStatus = statusOf(thin);
  assert.equal(thinStatus.verdict, "REVISE");
  assert.match(thinStatus.reasons.join("\n"), /at least 60/);

  const argued = projectWith([
    {
      ...REVIEW_READY,
      review: {
        gate: {
          ...gate,
          override: {
            reason:
              "The four pixels are FreeType stem hinting on this machine: rendering the parent " +
              "twice produces the same four, so they are not this revision's doing.",
          },
        },
      },
    },
  ], "override-argued");
  const arguedStatus = statusOf(argued);
  assert.equal(arguedStatus.verdict, "READY_FOR_APPROVAL");
  assert.deepEqual(
    arguedStatus.claims.lifted.map((c) => c.id),
    ["binary-gate-failed"],
  );
  // A waived rule is still reported: a clean audit and a waived one are not
  // the same thing to the person reading the status.
  assert.match(arguedStatus.reasons.join("\n"), /waived by gate\.override/);
});

test("READY cannot stand while a CRITICAL or MAJOR mismatch is on the list", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        mismatches: [
          { id: "footer-missing", severity: "CRITICAL", reason: "no footer band", action: "add it" },
          { id: "dot-pitch", severity: "MINOR", reason: "13.5px vs 17", action: "two spaces" },
        ],
      },
    },
  ], "severity");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.deepEqual(
    status.claims.blocking.map((c) => c.id),
    ["unresolved-severity"],
  );
  assert.match(status.reasons.join("\n"), /footer-missing/);
});

test("MINOR and accepted classifications do not block, which is what makes the rule usable", () => {
  // Exactly the ledger the charcoal-gold-cv run ended on: two MINORs with
  // recipes, three accepted limitations, two intentional differences.
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        mismatches: [
          { id: "marker-sits-high", severity: "MINOR", reason: "4.5px", action: "verticalAlign TOP" },
          { id: "caps-tracking", severity: "ACCEPTED_LIMITATION", reason: "no letter-spacing API" },
          { id: "measure-too-wide", severity: "INTENTIONAL_DIFFERENCE", reason: "narrower read worse" },
        ],
      },
    },
  ], "minor-only");

  assert.equal(statusOf(dir).verdict, "READY_FOR_APPROVAL");
});

test("READY cannot stand while the user's report is unaddressed", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        humanReportedMismatch: { id: "rail-crosses-marker", quote: "вот смотри проблема" },
      },
    },
  ], "human-open");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.deepEqual(
    status.claims.blocking.map((c) => c.id),
    ["human-report-open"],
  );
});

test("marking the report addressed is what releases it", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      review: {
        humanReportedMismatch: {
          id: "rail-crosses-marker",
          quote: "вот смотри проблема",
          addressed: true,
        },
      },
    },
  ], "human-closed");

  assert.equal(statusOf(dir).verdict, "READY_FOR_APPROVAL");
});

test("a quoted pixel count that disagrees with the measured one is not a measurement", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      stats: { mismatchPx: 211674, percent: 9.73, classification: "CRITICAL" },
      review: {
        gate: {
          kind: "visual-review",
          passed: true,
          metric: "diff: 0 px (0.000%)",
          pages: [{ page: 1, mismatchPixels: 0 }],
        },
      },
    },
  ], "fabricated");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.deepEqual(
    status.claims.blocking.map((c) => c.id),
    ["gate-metric-unmeasured"],
  );
  assert.match(status.reasons.join("\n"), /211674/);
});

// The subject here is the claims audit — an honest quote is not downgraded —
// and the fixture used to prove it with `classification: "CRITICAL"` and
// `gate.passed: false` while asserting READY_FOR_APPROVAL. That is the defect
// the fidelity veto exists to stop, so the test was passing on the strength of
// it: the audit was not downgrading, and nothing else was looking. The fixture
// is now internally honest (a MINOR page, a gate that passed, a quote that
// matches) so the assertion turns on the audit and not on the absent veto. The
// audit itself is unchanged; see the CRITICAL and MAJOR cases below.
test("a quoted pixel count that matches the measured one passes", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      stats: { mismatchPx: 9200, percent: 0.423, classification: "MINOR" },
      review: {
        gate: {
          kind: "visual-review",
          passed: true,
          metric: "diff: 9200 px (0.423%)",
          pages: [{ page: 1, mismatchPixels: 9200 }],
        },
      },
    },
  ], "honest");

  assert.equal(statusOf(dir).verdict, "READY_FOR_APPROVAL");
});

test("the audit only downgrades READY; it never rescues a REVISE", () => {
  const dir = projectWith([
    {
      verdict: "REVISE",
      mismatch: "header-height",
      review: { gate: { kind: "exact-diff", passed: false, metric: "AE => 900" } },
    },
  ], "no-rescue");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  // The named mismatch keeps the focus: a blocked claim is a reason the
  // verdict cannot stand, not automatically the thing to fix next.
  assert.equal(status.largestMismatch, "header-height");
});

// ---------------------------------------------------------------- budget ---
//
// The ceiling is about the agent circling. Two things it was charging for and
// should not: passes the user asked for, and passes that are demonstrably
// closing mismatches. A real run reported "9/8" for a correction the user had
// requested one message earlier, and stopped holding two MINOR fixes whose
// recipes it had already written down.

/**
 * A pass carrying `n` blocking mismatches.
 *
 * `tag` makes every pass's ids distinct, so `maxSameMismatchAttempts` — which
 * fires on the third attempt at one cause and would otherwise reach the
 * verdict first — stays out of these tests. What is under test here is only
 * the iteration ceiling.
 */
const withBlocking = (n, tag, verdict = "REVISE") => ({
  verdict,
  review: {
    mismatches: Array.from({ length: n }, (_, i) => ({
      id: `blocker-${tag}-${i + 1}`,
      severity: "MAJOR",
      reason: "differs",
      action: "fix it",
      rootCause: `cause-${tag}-${i + 1}`,
    })),
    largestMismatch: n > 0 ? `blocker-${tag}-1` : undefined,
  },
});

test("a pass the user asked for is not charged to the agent's budget", () => {
  const passes = Array.from({ length: config.limits.maxIterations }, (_, i) => ({
    verdict: "REVISE",
    mismatch: `mismatch-${i + 1}`,
  }));
  // One more, opened because the user named something — exactly the shape of
  // the run that read 9/8.
  passes.push({
    verdict: "READY_FOR_APPROVAL",
    review: {
      humanReportedMismatch: { id: "rail-crosses-marker", quote: "вот смотри проблема", addressed: true },
      mismatches: [],
    },
  });

  const status = statusOf(projectWith(passes, "user-asked"));
  assert.equal(status.iterations, config.limits.maxIterations + 1, "the total still counts them all");
  assert.equal(status.agentIterations, config.limits.maxIterations, "the budget counts only the agent's");
  assert.deepEqual(status.humanDirected.map((h) => h.report), ["rail-crosses-marker"]);
  assert.equal(status.remaining.iterations, 0);
  assert.equal(status.verdict, "READY_FOR_APPROVAL");
});

test("one report buys one free pass, not an open licence", () => {
  // Three passes carrying the same report: the user spoke once. Charging none
  // of them would make an unaddressed report a way to iterate forever.
  const report = { id: "timeline-wrong", quote: "the timeline looks wrong" };
  const dir = projectWith([
    { verdict: "REVISE", review: { humanReportedMismatch: report, mismatches: [] } },
    { verdict: "REVISE", review: { humanReportedMismatch: report, mismatches: [] } },
    { verdict: "REVISE", review: { humanReportedMismatch: report, mismatches: [] } },
  ], "one-report");

  const status = statusOf(dir);
  assert.equal(status.humanDirected.length, 1);
  assert.equal(status.agentIterations, 2);
});

test("a loop still closing mismatches gets a capped extension past the ceiling", () => {
  // Every pass closes one blocking mismatch. At the ceiling that is a loop
  // converging, not a loop circling — and the bound that catches circling
  // (maxSameMismatchAttempts) is untouched by this.
  const start = config.limits.maxIterations + 1;
  const passes = Array.from({ length: config.limits.maxIterations }, (_, i) =>
    withBlocking(start - i, i),
  );

  const status = statusOf(projectWith(passes, "converging-past"));
  assert.equal(status.verdict, "REVISE", status.reasons.join(" | "));
  assert.ok(status.grantedExtension, "no extension was granted to a converging loop");
  assert.equal(status.grantedExtension.used, 1);
  assert.equal(status.grantedExtension.of, config.limits.maxIterationGrants);
  assert.match(status.reasons.join("\n"), /closed 1 blocking mismatch/);
});

test("a loop that closed nothing on its last pass stops at the ceiling, as before", () => {
  const passes = Array.from({ length: config.limits.maxIterations }, (_, i) => withBlocking(2, i));

  const status = statusOf(projectWith(passes, "stalled-at-ceiling"));
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.equal(status.failureCategory, "ITERATION_LIMIT");
  assert.equal(status.grantedExtension, null);
  assert.match(status.reasons.join("\n"), /closed no blocking mismatch/);
});

test("extensions run out, so converging is not a way to iterate forever", () => {
  // Long enough that every grant is spent and the loop is still going.
  const total = config.limits.maxIterations + config.limits.maxIterationGrants + 1;
  const passes = Array.from({ length: total }, (_, i) => withBlocking(total - i + 1, i));

  const status = statusOf(projectWith(passes, "grants-spent"));
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.equal(status.failureCategory, "ITERATION_LIMIT");
  assert.equal(status.remaining.iterationGrants, 0);
  assert.match(status.reasons.join("\n"), /extensions are spent/);
});

test("convergence is measured on the severity ledger, never on the pixel count", () => {
  // The case that rules the pixel count out: capping a timeline rail with its
  // marker was a real structural fix and moved the page total UP, 211583 to
  // 211674, because it repainted a few glyph edges. A convergence test built
  // on that number calls the fix a regression.
  const dir = projectWith([
    {
      ...withBlocking(2, "a"),
      stats: { mismatchPx: 211583, percent: 9.734 },
    },
    {
      ...withBlocking(1, "b"),
      stats: { mismatchPx: 211674, percent: 9.738 },
    },
  ], "ledger-not-pixels");

  const status = statusOf(dir);
  assert.equal(status.convergence.measurable, true);
  assert.equal(status.convergence.converging, true, "the pixel count rose; the ledger fell");
  assert.equal(status.convergence.from, 2);
  assert.equal(status.convergence.to, 1);
});

test("coining a fresh report id every pass does not buy an unbounded loop", () => {
  // The loophole a review of this file found: `humanReportedMismatch` is
  // written by the same model whose verdict this module stopped trusting, and
  // the schema sanctions coining a new id. Uncapped, an agent that coins one
  // per pass holds agentIterations at zero and never reaches the ceiling —
  // the self-report closed at the verdict, reopened at the budget.
  const total = config.limits.maxIterations + config.limits.maxIterationGrants + 4;
  const passes = Array.from({ length: total }, (_, i) => ({
    verdict: "REVISE",
    review: {
      humanReportedMismatch: { id: `coined-${i + 1}`, quote: "they said something" },
      mismatches: [],
    },
  }));

  const status = statusOf(projectWith(passes, "coined-ids"));
  assert.equal(
    status.humanDirected.length,
    config.limits.maxIterationGrants,
    "exemptions must be capped, not merely deduplicated",
  );
  assert.ok(status.exemptionsRefused.length > 0, "the refused reports are not reported");
  assert.equal(status.agentIterations, total - config.limits.maxIterationGrants);
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.match(status.reasons.join("\n"), /nothing on disk\s+proves a person spoke/);
});

test("a latest pass with no review cannot be granted an extension on an older one's progress", () => {
  // convergence() used to compare the last two entries THAT HAVE A REVIEW, so
  // a loop whose newest revision carried none could be extended on the
  // strength of a pass that is not the last one — while the reason string
  // claimed "the last pass closed N".
  const passes = Array.from({ length: config.limits.maxIterations - 1 }, (_, i) =>
    withBlocking(config.limits.maxIterations - i, i),
  );
  passes.push({}); // rendered, never reviewed

  const status = statusOf(projectWith(passes, "unreviewed-latest"));
  assert.equal(status.convergence.measurable, false);
  assert.equal(status.grantedExtension, null);
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.equal(status.failureCategory, "ITERATION_LIMIT");
  assert.match(status.reasons.join("\n"), /no second reviewed pass|has no visual-review\.json/);
});

test("a review that omits its mismatch list has not closed anything", () => {
  // Reading a damaged record as "zero blocking mismatches" would hand out an
  // extension for having written a worse file. `mismatches` is required by the
  // schema, so its absence is damage, not progress.
  const passes = Array.from({ length: config.limits.maxIterations - 1 }, (_, i) =>
    withBlocking(config.limits.maxIterations - i, i),
  );
  passes.push({ verdict: "REVISE", review: { largestMismatch: "still-broken", mismatches: undefined } });

  const status = statusOf(projectWith(passes, "no-ledger"));
  assert.equal(status.convergence.measurable, false, "an absent ledger is not a cleared one");
  assert.equal(status.grantedExtension, null);
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
});

test("a parent-comparison claim is not checked against reference stats, or the other way round", () => {
  // visual-diff-stats.json is rewritten by whichever diff ran last. A revision
  // diffed both ways leaves stats for one of them, and checking the other
  // claim against that file reports a fabrication where there is only a stale
  // file. The file says which comparison it was: a reference diff scales into
  // the revision folder, a parent diff is handed the parent's output.png.
  const dir = projectWith([
    {
      verdict: "READY_FOR_APPROVAL",
      // Reference stats: the compared image lives inside this revision.
      statsReferenceInside: true,
      stats: { mismatchPx: 211674 },
      review: {
        comparedAgainst: "parent",
        gate: {
          kind: "exact-diff",
          passed: true,
          metric: "magick compare -metric AE => 0",
          pages: [{ page: 1, mismatchPixels: 0 }],
        },
      },
    },
  ], "cross-comparison");

  const status = statusOf(dir);
  assert.deepEqual(
    status.claims.blocking.map((c) => c.id),
    [],
    "a parent claim was blocked by reference stats",
  );
  assert.equal(status.verdict, "READY_FOR_APPROVAL");
});

test("a claim IS checked when the stats file records the same comparison", () => {
  const dir = projectWith([
    {
      verdict: "READY_FOR_APPROVAL",
      statsReferenceInside: true,
      stats: { mismatchPx: 211674 },
      review: {
        comparedAgainst: "reference",
        gate: {
          kind: "visual-review",
          passed: true,
          metric: "diff: 0 px",
          pages: [{ page: 1, mismatchPixels: 0 }],
        },
      },
    },
  ], "same-comparison");

  assert.deepEqual(
    statusOf(dir).claims.blocking.map((c) => c.id),
    ["gate-metric-unmeasured"],
  );
});

test("READY without any quoted pixel count is not a checked verdict", () => {
  const dir = projectWith([
    {
      verdict: "READY_FOR_APPROVAL",
      statsReferenceInside: true,
      stats: { mismatchPx: 271604 },
      review: {
        comparedAgainst: "reference",
        // The shape the corpus census found on twelve READY reviews: a metric
        // written as prose, and no figure anything could compare it with.
        gate: { kind: "visual-review", passed: true, metric: "magick compare -metric AE => 271604 px (12.50%)" },
      },
    },
  ], "unquoted");

  const status = statusOf(dir);
  assert.deepEqual(status.claims.blocking.map((c) => c.id), ["gate-metric-unquoted"]);
  assert.equal(status.verdict, "REVISE");
});

test("a pass still looping is not asked to quote a figure it has not settled on", () => {
  const dir = projectWith([
    {
      verdict: "REVISE",
      mismatch: "type-size",
      statsReferenceInside: true,
      stats: { mismatchPx: 271604 },
      review: { comparedAgainst: "reference", gate: { kind: "visual-review", passed: false } },
    },
  ], "mid-loop");

  // Its open MAJOR is the reason it is still looping; the quote is not asked for.
  assert.equal(
    statusOf(dir).claims.blocking.some((c) => c.id === "gate-metric-unquoted"),
    false,
  );
});

test("READY needs no quote where nothing was measured to compare it against", () => {
  // No stats file: `unmeasured-render` is the fault, and iteration-status
  // reports that one step earlier. Naming it twice in different words is how a
  // reader learns to skim the reasons.
  const dir = projectWith([
    {
      verdict: "READY_FOR_APPROVAL",
      review: { comparedAgainst: "reference", gate: { kind: "visual-review", passed: true } },
    },
  ], "unmeasured");

  assert.equal(
    statusOf(dir).claims.blocking.some((c) => c.id === "gate-metric-unquoted"),
    false,
  );
});

// ------------------------------------------------------------- renders ---

test("renders inside a revision are counted from attempts.json, and a stalled sweep is named", async () => {
  const { recordAttempt } = await import("../lib/attempts.mjs");
  const dir = projectWith(
    [
      { verdict: "REVISE", mismatch: "type-size" },
      { verdict: "REVISE", mismatch: "type-size" },
    ],
    "renders",
  );
  const first = path.join(dir, "revisions", "revision-001");
  const second = path.join(dir, "revisions", "revision-002");
  fs.writeFileSync(path.join(first, "GeneratedCvTemplate.java"), "a");
  recordAttempt(first, { percent: 7.0, mismatchPx: 700 });

  // Four renders of the second revision, each a different source, the last two
  // moving under the material threshold.
  [6.622, 6.651, 6.62, 6.598].forEach((percent, i) => {
    fs.writeFileSync(path.join(second, "GeneratedCvTemplate.java"), `v${i}`);
    recordAttempt(second, { percent, mismatchPx: Math.round(percent * 1000) });
  });

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.iterations, 2, "folders are still what iterations count");
  assert.equal(status.renders.total, 5, "renders count measurements");
  assert.equal(status.renders.latest.renders, 4);
  assert.equal(status.renders.latest.stalled, true);
  assert.ok(
    status.reasons.some((r) => /rendered 4 times/.test(r) && /stopped buying anything/.test(r)),
    JSON.stringify(status.reasons),
  );
  // Evidence, not a verdict: the loop is still allowed to continue.
  assert.equal(status.verdict, "REVISE");
});

test("a re-run of unchanged sources is reported, and revisions without attempts.json still work", () => {
  const dir = projectWith([{ verdict: "REVISE", mismatch: "x" }], "reruns");
  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.renders.total, 0);
  assert.equal(status.renders.latest.renders, 0);
  assert.ok(!status.reasons.some((r) => /re-runs/.test(r)));
});

// --------------------------------------------------------- limitations ---

test("an accepted limitation is never the focus, never counts toward the same-cause bound, and never blocks READY", async () => {
  const { acceptLimitation } = await import("../lib/limitations.mjs");
  // Three passes at the typeface, exactly the corpus pattern (revolut-proposal 4/3).
  const dir = projectWith(
    [
      { verdict: "REVISE", mismatch: "substituted-typeface" },
      { verdict: "REVISE", mismatch: "substituted-typeface" },
      {
        verdict: "READY_FOR_APPROVAL",
        mismatch: "substituted-typeface",
        review: {
          mismatches: [
            { id: "substituted-typeface", severity: "MAJOR", reason: "Google Sans is not bundled", action: "none available" },
            { id: "page-number-low", severity: "MAJOR", reason: "footer sits 9px low", action: "raise it" },
            { id: "hairline-tint", severity: "MINOR", reason: "rule is a shade light", action: "darken" },
          ],
        },
      },
    ],
    "limitations",
  );

  // Without the record, the bound fires and READY is refused.
  const before = computeIterationStatus({ projectDir: dir, config });
  assert.equal(before.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.equal(before.largestMismatch, "substituted-typeface");

  acceptLimitation(dir, {
    id: "heading-face",
    reason: "the reference sets its headings in Google Sans, which is not distributable; Lato is the nearest bundled family",
    decidedBy: "user",
    cause: "TYPOGRAPHY",
    mismatchIds: ["substituted-typeface"],
  });

  const after = computeIterationStatus({ projectDir: dir, config });
  // The focus moves to the next blocking mismatch the review rated.
  assert.equal(after.largestMismatch, "page-number-low");
  assert.equal(after.sameMismatchAttempts, 1, "the typeface passes no longer count against the new focus");
  assert.deepEqual(after.limitations.active, ["heading-face"]);
  assert.deepEqual(after.limitations.skipped, [{ id: "substituted-typeface", limitation: "heading-face" }]);
  assert.ok(after.reasons.some((r) => /covered by the accepted limitation "heading-face"/.test(r)));
  // READY still cannot stand: page-number-low is MAJOR and not covered.
  assert.equal(after.verdict, "REVISE");
  assert.ok(after.claims.blocking.some((c) => c.id === "unresolved-severity" && /page-number-low/.test(c.detail)));
  assert.ok(!after.claims.blocking.some((c) => /substituted-typeface/.test(c.detail)));
});

test("with every blocking mismatch covered, READY stands", async () => {
  const { acceptLimitation } = await import("../lib/limitations.mjs");
  const dir = projectWith(
    [
      {
        verdict: "READY_FOR_APPROVAL",
        mismatch: "substituted-typeface",
        review: {
          // READY quotes the measured figure — see gate-metric-unquoted. This
          // test is about limitation coverage, so the gate is here only to keep
          // the fixture a valid READY rather than to be what is under test.
          gate: { kind: "visual-review", passed: true, metric: "diff: 1 px (0.100%)", pages: [{ page: 1, mismatchPixels: 1 }] },
          mismatches: [
            { id: "substituted-typeface", severity: "MAJOR", reason: "not bundled", action: "none" },
            { id: "hairline-tint", severity: "MINOR", reason: "a shade light", action: "darken" },
          ],
        },
      },
    ],
    "covered",
  );
  // The revision has to be measured for READY to stand at all.
  const rev = path.join(dir, "revisions", "revision-001");
  fs.writeFileSync(path.join(rev, "output.png"), "x");
  fs.writeFileSync(path.join(rev, "visual-diff-stats.json"), JSON.stringify({ mismatchPx: 1, percent: 0.1, reference: path.join(rev, "reference-scaled.png") }));

  assert.equal(computeIterationStatus({ projectDir: dir, config }).verdict, "REVISE");
  acceptLimitation(dir, {
    id: "heading-face",
    reason: "the reference sets its headings in Google Sans, which is not distributable; Lato is the nearest bundled family",
    decidedBy: "user",
    cause: "TYPOGRAPHY",
    mismatchIds: ["substituted-typeface"],
  });
  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.verdict, "READY_FOR_APPROVAL", JSON.stringify(status.reasons));
  assert.equal(status.largestMismatch, "hairline-tint");
});

// -------------------------------------------------------- human report ---

test("a report written to human-report.json is the focus until a review marks it addressed", () => {
  const dir = projectWith(
    [
      { verdict: "REVISE", mismatch: "header-height" },
      // The user spoke; the revision opened with --report carries the file and
      // this review says nothing about it.
      { verdict: "REVISE", mismatch: "header-height" },
      // A later pass whose review still says nothing about it.
      { verdict: "REVISE", mismatch: "hairline-tint" },
    ],
    "report-file",
  );
  fs.writeFileSync(
    path.join(dir, "revisions", "revision-002", "human-report.json"),
    JSON.stringify({ schemaVersion: 1, id: "timeline-rail-overshoot", quote: "the timeline looks wrong", addressed: false }),
  );

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.largestMismatch, "timeline-rail-overshoot");
  assert.equal(status.focusSource, "human");
  assert.deepEqual(
    status.humanDirected.map((h) => h.report),
    ["timeline-rail-overshoot"],
    "the pass the user asked for is exempt from the budget, once",
  );
  assert.equal(status.agentIterations, 2);
  // Still open, so READY could not stand either.
  assert.ok(status.claims.blocking.some((c) => c.id === "human-report-open"));
});

test("a review that marks the report addressed closes it for every later pass", () => {
  const dir = projectWith(
    [
      { verdict: "REVISE", mismatch: "header-height" },
      {
        verdict: "REVISE",
        mismatch: "header-height",
        reported: { id: "timeline-rail-overshoot", quote: "the timeline looks wrong", addressed: true },
      },
      { verdict: "REVISE", mismatch: "hairline-tint" },
    ],
    "report-closed",
  );
  fs.writeFileSync(
    path.join(dir, "revisions", "revision-001", "human-report.json"),
    JSON.stringify({ schemaVersion: 1, id: "timeline-rail-overshoot", quote: "the timeline looks wrong", addressed: false }),
  );
  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.largestMismatch, "hairline-tint");
  assert.equal(status.focusSource, "measured");
  assert.ok(!status.claims.blocking.some((c) => c.id === "human-report-open"));
});

// -------------------------------------------------------- harness focus ---

test("a harness focus written by render-and-diff outranks the review's, and the bound counts it", () => {
  // The same reviewer names a different region each pass while the page size
  // stays unsettled; without the file the same-cause bound would reset every
  // pass and only the flat ceiling would end the loop.
  const dir = projectWith(
    [
      { verdict: "REVISE", mismatch: "header-height" },
      { verdict: "REVISE", mismatch: "sidebar-width" },
      { verdict: "REVISE", mismatch: "footer-gap" },
    ],
    "harness-focus",
  );
  for (const id of ["revision-001", "revision-002", "revision-003"]) {
    fs.writeFileSync(
      path.join(dir, "revisions", id, "harness-focus.json"),
      JSON.stringify({ schemaVersion: 1, focus: "page-size-unsettled", focusSource: "page-parity", next: "settle it" }),
    );
  }
  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.largestMismatch, "page-size-unsettled");
  assert.equal(status.focusSource, "page-parity");
  assert.equal(status.sameMismatchAttempts, 3, "three passes with the page model open are three attempts at it");
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
});

// ---------------------------------------------------------------------------
// Fidelity is binding: the comparator can refuse a verdict the review wrote.
//
// Every fixture below passes the checks that already existed — the revision is
// sealed, it was measured, the review is present, and its claims agree with the
// stats file — so what refuses them is the fidelity axis and nothing else.
// ---------------------------------------------------------------------------

/**
 * The run this guard was written for, reproduced from its artifacts.
 *
 * TestHarness/graphcompose-flow/projects/nora-bennett-cv, revision-001, on
 * harness 0.24.0-beta.1 with Gemini 3 Flash. The comparator measured 308095
 * mismatched pixels (14.174% of the page, parityScore 43, ssim 0.4196) and
 * classified it CRITICAL. The review quoted 308095 back correctly, labelled the
 * four differences MINOR and INTENTIONAL_DIFFERENCE, wrote `gate.passed: true`
 * and `verdict: READY_FOR_APPROVAL` — and the loop stopped after one pass and
 * offered the template for approval.
 *
 * Nothing in that chain was a lie the audit could catch: the number is right,
 * and severity is the review's to assign. The only thing that disagreed was the
 * comparator, and nobody was reading it.
 */
test("the nora-bennett-cv run cannot reach READY: CRITICAL is binding", () => {
  const dir = projectWith([
    {
      ...REVIEW_READY,
      statsReferenceInside: true,
      stats: {
        width: 1240,
        height: 1753,
        totalPx: 2173720,
        mismatchPx: 308095,
        percent: 14.173628618221299,
        parityScore: 43,
        classification: "CRITICAL",
        perceptual: { ssim: 0.4196, classification: "CRITICAL" },
      },
      review: {
        pixelSimilaritySignal: 85.83,
        gate: {
          kind: "visual-review",
          passed: true,
          metric: "diff: 308095 px (14.174%) — visual-review",
          pages: [{ page: 1, mismatchPixels: 308095, percentOfPage: 14.173628618221299 }],
        },
        mismatches: [
          { id: "typography-antialiasing", severity: "MINOR", cause: "TYPOGRAPHY", reason: "aa", action: "keep" },
          { id: "monogram-approximation", severity: "INTENTIONAL_DIFFERENCE", cause: "ASSET", reason: "as planned" },
        ],
      },
    },
  ], "nora-bennett-regression");

  const status = statusOf(dir);
  assert.notEqual(status.verdict, "READY_FOR_APPROVAL");
  assert.equal(status.verdict, "REVISE");
  assert.equal(status.parity.fidelity.level, "CRITICAL");
  assert.equal(status.parity.fidelity.classification, "CRITICAL");
  assert.equal(status.parity.fidelity.parityScore, 43);
  assert.equal(status.parity.fidelity.ssim, 0.4196);
  assert.ok(
    status.reasons.some((r) => r.includes("CRITICAL classification is never")),
    `the refusal must say why; got ${JSON.stringify(status.reasons)}`,
  );
});

test("a MAJOR page that has stopped moving is a stall, not a finish", () => {
  // Three passes carrying the same mismatch id, because movement needs two
  // deltas and the first pass has nothing to be measured against. The severity
  // is MINOR so the claims audit has nothing to say and the refusal is the
  // fidelity axis's alone. The page moves 4.30% -> 4.20% -> 4.19%, both deltas
  // under the 0.25 material move: STALLED movement, NEEDS_WORK fidelity — the
  // loop has stopped without arriving.
  const listed = (id) => ({
    largestMismatch: id,
    mismatches: [{ id, severity: "MINOR", cause: "GEOMETRY", reason: "differs", action: "nudge it" }],
  });
  const dir = projectWith([
    { verdict: "REVISE", statsReferenceInside: true,
      stats: { mismatchPx: 92000, percent: 4.30, classification: "MAJOR" },
      review: listed("sidebar-width") },
    { verdict: "REVISE", statsReferenceInside: true,
      stats: { mismatchPx: 90000, percent: 4.20, classification: "MAJOR" },
      review: listed("sidebar-width") },
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 89900, percent: 4.19, classification: "MAJOR" },
      review: {
        ...listed("sidebar-width"),
        gate: { kind: "visual-review", passed: true, metric: "diff: 89900 px (4.190%)",
                pages: [{ page: 1, mismatchPixels: 89900 }] },
      } },
  ], "major-stalled");

  const status = statusOf(dir);
  // The veto takes READY down to REVISE; the same-cause bound, which the third
  // pass has now spent, takes REVISE on to CONVERGENCE_LIMIT_REACHED. That
  // composition is the "stalled, needs a person" state: a document exists and
  // the loop is out of ideas, which is neither success nor a blocked build.
  assert.notEqual(status.verdict, "READY_FOR_APPROVAL");
  assert.equal(status.verdict, "CONVERGENCE_LIMIT_REACHED");
  assert.equal(status.parity.fidelity.level, "NEEDS_WORK");
  assert.equal(status.parity.movement.level, "STALLED");
  assert.ok(
    status.reasons.some((r) => r.includes("stall, not a finish")),
    `a converged bad result must be reported as a stall; got ${JSON.stringify(status.reasons)}`,
  );
});

test("a MAJOR page still moving is told to keep going, not that it is ready", () => {
  const dir = projectWith([
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 89900, percent: 4.19, classification: "MAJOR" },
      review: {
        gate: { kind: "visual-review", passed: true, metric: "diff: 89900 px (4.190%)",
                pages: [{ page: 1, mismatchPixels: 89900 }] },
      } },
  ], "major-improving");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.equal(status.parity.fidelity.level, "NEEDS_WORK");
});

test("MINOR and IDENTICAL leave a READY verdict alone", () => {
  for (const classification of ["MINOR", "IDENTICAL"]) {
    const dir = projectWith([
      { ...REVIEW_READY, statsReferenceInside: true,
        stats: { mismatchPx: 4000, percent: classification === "IDENTICAL" ? 0 : 0.18, classification },
        review: {
          gate: { kind: "visual-review", passed: true, metric: "diff: 4000 px (0.184%)",
                  pages: [{ page: 1, mismatchPixels: 4000 }] },
        } },
    ], `pass-${classification}`);

    const status = statusOf(dir);
    assert.equal(status.verdict, "READY_FOR_APPROVAL", `${classification} must not be refused`);
    assert.equal(status.parity.fidelity.level, "PASS");
  }
});

test("fidelity never rescues a REVISE into a READY", () => {
  // The measurement may refuse; it may not approve. A review that asked for
  // another pass keeps its answer even on a page the comparator likes.
  const dir = projectWith([
    { verdict: "REVISE", mismatch: "icon-baseline", statsReferenceInside: true,
      stats: { mismatchPx: 0, percent: 0, classification: "IDENTICAL" } },
  ], "no-rescue");

  const status = statusOf(dir);
  assert.equal(status.verdict, "REVISE");
  assert.equal(status.parity.fidelity.level, "PASS");
});

test("a stats file with no classification is UNMEASURED, and never reads as a pass", () => {
  const dir = projectWith([
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 12, percent: 0.001 },
      review: {
        gate: { kind: "visual-review", passed: true, metric: "diff: 12 px (0.001%)",
                pages: [{ page: 1, mismatchPixels: 12 }] },
      } },
  ], "unclassified");

  const status = statusOf(dir);
  assert.equal(status.parity.fidelity.level, "UNMEASURED");
  assert.equal(status.parity.fidelity.classification, null);
});

// ------------------------------------------------- the review's own schema ---
//
// `visual-review.json` is the artifact the whole loop verdict starts from, and
// it was the one artifact nothing validated: `write-artifact` does not accept
// it and the write guard leaves it alone by name. `schemas/visual-review.schema
// .json` — 359 lines, with enums for verdict, severity and cause — was run by
// no runtime path at all. One run conformed to it only because the model went
// and read the schema for itself.

const reviewValidator = (await ready())
  ? schemaValidator(path.join(repoRoot, "schemas", "visual-review.schema.json"))
  : null;

/** The same call the CLI makes, with the real validator rather than a stub. */
const checkedStatusOf = (projectDir, revisionId = null) =>
  computeIterationStatus({ projectDir, config, revisionId, validateReview: reviewValidator });

test("THE CASE: a review that does not match its schema is not a judgement", { skip: !reviewValidator && "the schema validator is not installed" }, () => {
  const dir = projectWith([
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 12, percent: 0.001, classification: "IDENTICAL" },
      review: { mismatches: [{ id: "x", severity: "SEVERE", reason: "differs" }] } },
  ], "review-bad-enum");

  const status = checkedStatusOf(dir);
  assert.equal(status.verdict, "REVISE", "a malformed review kept its verdict");
  assert.match(status.reasons.join("\n"), /does not match visual-review\.schema\.json/);
  assert.match(status.reasons.join("\n"), /a review nothing can read is not a judgement/);
});

test("an invented verdict does not travel, whatever it says", { skip: !reviewValidator && "the schema validator is not installed" }, () => {
  // The enum has four members. A fifth is not a decision the loop can act on,
  // and leaving it to stand would carry it through every consumer as written.
  const dir = projectWith([
    { verdict: "SHIP_IT", statsReferenceInside: true, stats: { mismatchPx: 0, percent: 0, classification: "IDENTICAL" } },
  ], "review-bad-verdict");

  assert.equal(checkedStatusOf(dir).verdict, "REVISE");
});

test("a review that matches its schema is not held", { skip: !reviewValidator && "the schema validator is not installed" }, () => {
  // The quiet half: this must not start refusing the reviews the corpus writes.
  // A READY fixture needs its gate and a quoted measurement to satisfy the
  // claims audit — that is a separate rule, and this case has to clear it to be
  // about the schema at all.
  const dir = projectWith([
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 12, percent: 0.001, classification: "IDENTICAL" },
      review: {
        gate: { kind: "visual-review", passed: true, metric: "diff: 12 px (0.001%)", pages: [{ page: 1, mismatchPixels: 12 }] },
      } },
  ], "review-valid");

  const status = checkedStatusOf(dir);
  assert.equal(status.verdict, "READY_FOR_APPROVAL");
  assert.doesNotMatch(status.reasons.join("\n"), /does not match visual-review\.schema\.json/);
});

test("without a validator the shape goes unchecked, which is what every caller did before", () => {
  // The injection contract: `approve-and-publish` passes none, and its behaviour
  // is unchanged by this.
  const dir = projectWith([
    { ...REVIEW_READY, statsReferenceInside: true,
      stats: { mismatchPx: 12, percent: 0.001, classification: "IDENTICAL" },
      review: { mismatches: [{ id: "x", severity: "SEVERE", reason: "differs" }] } },
  ], "review-unchecked");

  assert.doesNotMatch(statusOf(dir).reasons.join("\n"), /does not match visual-review\.schema\.json/);
});

// --------------------------------------------- a sweep that goes backwards ---

test("a sweep that has left its own best behind is named, with the render to return to", async () => {
  const { recordAttempt } = await import("../lib/attempts.mjs");
  const dir = projectWith([{ verdict: "REVISE", mismatch: "type-size" }], "regressing");
  const only = path.join(dir, "revisions", "revision-001");

  // The trail the corpus produced: best at the third of six.
  [17.6, 15.061, 14.866, 15.538, 15.489, 15.737].forEach((percent, i) => {
    fs.writeFileSync(path.join(only, "GeneratedCvTemplate.java"), `v${i}`);
    recordAttempt(only, { percent, mismatchPx: Math.round(percent * 1000) });
  });

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.renders.latest.regressed, true);
  const reason = status.reasons.find((r) => /worse than its own best/.test(r));
  assert.ok(reason, JSON.stringify(status.reasons));
  assert.match(reason, /render 3 of 6/, "the render to go back to is named");
  assert.match(reason, /the change that helped is the one to go back to/);

  // Not improving, whatever else it is doing — the axis the fidelity gate reads.
  assert.equal(status.parity.movement.level, "STALLED");
  assert.equal(status.parity.movement.source, "sweep");
});

test("a retreat is reported instead of a plateau, not beside it", async () => {
  // At the sixth render of that trail both hold. They describe one trail, and
  // the regression message is the one that says where to go back to.
  const { recordAttempt } = await import("../lib/attempts.mjs");
  const dir = projectWith([{ verdict: "REVISE", mismatch: "type-size" }], "regress-not-stall");
  const only = path.join(dir, "revisions", "revision-001");
  [17.6, 15.061, 14.866, 15.538, 15.489, 15.737].forEach((percent, i) => {
    fs.writeFileSync(path.join(only, "GeneratedCvTemplate.java"), `v${i}`);
    recordAttempt(only, { percent, mismatchPx: Math.round(percent * 1000) });
  });

  const status = computeIterationStatus({ projectDir: dir, config });
  assert.equal(status.renders.latest.stalled, true, "the fixture really does hold both");
  assert.equal(
    status.reasons.filter((r) => /stopped buying anything|worse than its own best/.test(r)).length,
    1,
    JSON.stringify(status.reasons),
  );
});
