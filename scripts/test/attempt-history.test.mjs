#!/usr/bin/env node
/**
 * scripts/test/attempt-history.test.mjs — what the loop has already tried, and
 * whether it is still buying anything.
 *
 * `sameMismatchAttempts` counts passes and stops the loop at three. Counting
 * prevents circling forever; it does not prevent repeating. A run spent three
 * revisions on one wrapped label, moving a shared constant to 8.5, then 8.65,
 * then reasoning its way back toward 8.5 — a value it had already rendered and
 * measured. Nothing on disk said so, because the attempts were one per revision
 * and nobody had put them in a row.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { attemptHistory, diminishingReturns } from "../lib/iteration-status.mjs";

/** One pass, as `computeIterationStatus` loads it off disk. */
function pass(id, { cause, action, percent }) {
  return {
    id,
    revision: { id, status: "DRAFT", parentRevisionId: null },
    review: {
      verdict: "REVISE",
      largestMismatch: "label-wraps",
      mismatches: [{ id: "label-wraps", severity: "MAJOR", rootCause: cause, reason: "r", action }],
    },
    stats: percent === null ? null : { percent },
  };
}

// The shape of the run this came from: one shared constant, moved three times,
// with the page difference barely responding after the first pass.
const CHAIN = [
  pass("revision-001", { cause: "label-size", action: "Take LABEL_SIZE to 8.5. It is what revision-000 rendered.", percent: 14.68 }),
  pass("revision-002", { cause: "label-size", action: "Raise LABEL_SIZE to 8.65 so the labels match the reference width.", percent: 14.66 }),
  pass("revision-003", { cause: "label-size", action: "Take a quarter-point off the shared label size.", percent: 14.64 }),
];

test("the attempts on one cause come back in order, with what each measured", () => {
  const history = attemptHistory(CHAIN, "label-size");

  assert.deepEqual(history.map((a) => a.revision), ["revision-001", "revision-002", "revision-003"]);
  assert.deepEqual(history.map((a) => a.percent), [14.68, 14.66, 14.64]);
  // The first attempt has nothing before it, so it moved nothing measurable.
  assert.deepEqual(history.map((a) => a.moved), [null, -0.02, -0.02]);
});

test("the action is the lever pulled, not the argument for it", () => {
  const [first] = attemptHistory(CHAIN, "label-size");
  assert.equal(first.action, "Take LABEL_SIZE to 8.5.");
  assert.ok(first.action.length < 60, "the whole paragraph came back");
});

test("the history stops where the cause changes", () => {
  // Only the trailing run is what "this cause has had N attempts" is about; a
  // pass about something else is not an attempt at this one.
  const mixed = [
    pass("revision-001", { cause: "other-thing", action: "Something else entirely.", percent: 20 }),
    ...CHAIN.slice(1),
  ];
  const history = attemptHistory(mixed, "label-size");
  assert.deepEqual(history.map((a) => a.revision), ["revision-002", "revision-003"]);
});

test("no cause in front means no history rather than the whole chain", () => {
  assert.deepEqual(attemptHistory(CHAIN, null), []);
});

test("two attempts that each move nothing are reported as stalled", () => {
  const stalling = diminishingReturns(attemptHistory(CHAIN, "label-size"), 0.25);

  assert.equal(stalling.measurable, true);
  assert.equal(stalling.stalled, true, "-0.02 twice against a 0.25 floor is not movement");
  assert.deepEqual(stalling.moves.map((m) => m.revision), ["revision-002", "revision-003"]);
});

test("a pass that actually moved the page is not stalling", () => {
  const moving = [
    CHAIN[0],
    pass("revision-002", { cause: "label-size", action: "Rebuild the block.", percent: 9.1 }),
    pass("revision-003", { cause: "label-size", action: "Trim the gap.", percent: 8.95 }),
  ];
  const stalling = diminishingReturns(attemptHistory(moving, "label-size"), 0.25);
  assert.equal(stalling.stalled, false, "a 6.1-point move was read as no movement");
});

test("one attempt cannot say whether the loop is stalling", () => {
  const single = diminishingReturns(attemptHistory([CHAIN[0]], "label-size"), 0.25);
  assert.equal(single.measurable, false);
  assert.equal(single.stalled, false, "a loop with nothing to compare was called stalled");
});

test("passes with no measurement are not counted as movement of zero", () => {
  // A pass that never rendered has no percent. Treating that as "moved 0" would
  // report a loop as stalled on the strength of a comparison that never ran.
  const unmeasured = [
    CHAIN[0],
    pass("revision-002", { cause: "label-size", action: "Try again.", percent: null }),
    pass("revision-003", { cause: "label-size", action: "And again.", percent: null }),
  ];
  const stalling = diminishingReturns(attemptHistory(unmeasured, "label-size"), 0.25);
  assert.equal(stalling.measurable, false);
});
