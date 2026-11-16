#!/usr/bin/env node
/**
 * scripts/test/fidelity.test.mjs — the two axes, exercised without a filesystem.
 *
 * `iteration-status.test.mjs` proves the composition on real revision chains.
 * This file proves the arithmetic underneath it: which classification maps to
 * which fidelity level, what movement reads as, and — the rule the whole
 * change exists for — that the measurement may refuse a verdict and may never
 * grant one.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CONVERGENCE,
  FIDELITY,
  convergenceOf,
  fidelityOf,
  reconcileVerdict,
} from "../lib/fidelity.mjs";

const statsFor = (classification, extra = {}) => ({
  mismatchPx: 1000,
  percent: 1.5,
  parityScore: 94,
  classification,
  perceptual: { ssim: 0.98 },
  ...extra,
});

test("the comparator's classification decides fidelity, and nothing else does", () => {
  assert.equal(fidelityOf(statsFor("IDENTICAL")).level, FIDELITY.PASS);
  assert.equal(fidelityOf(statsFor("MINOR")).level, FIDELITY.PASS);
  assert.equal(fidelityOf(statsFor("MAJOR")).level, FIDELITY.NEEDS_WORK);
  assert.equal(fidelityOf(statsFor("CRITICAL")).level, FIDELITY.CRITICAL);
});

test("a parityScore or ssim that flatters the page cannot lift its classification", () => {
  // The point of naming one metric binding: the others are reported, not obeyed.
  const flattering = statsFor("CRITICAL", { parityScore: 99, perceptual: { ssim: 0.999 } });
  const verdict = fidelityOf(flattering);
  assert.equal(verdict.level, FIDELITY.CRITICAL);
  assert.equal(verdict.parityScore, 99, "still reported");
  assert.equal(verdict.ssim, 0.999, "still reported");
});

test("an absent measurement is UNMEASURED, never a pass", () => {
  assert.equal(fidelityOf(null).level, FIDELITY.UNMEASURED);
  assert.equal(fidelityOf(undefined).level, FIDELITY.UNMEASURED);
  assert.equal(fidelityOf({}).level, FIDELITY.UNMEASURED);
  assert.equal(fidelityOf({ percent: 0 }).level, FIDELITY.UNMEASURED,
    "a percent with no classification is not a classification");
});

test("a review-only label in a stats file is not a measurement", () => {
  // ACCEPTED_LIMITATION and INTENTIONAL_DIFFERENCE require a human note and the
  // comparator never writes them; seeing one here means the file was authored.
  for (const label of ["ACCEPTED_LIMITATION", "INTENTIONAL_DIFFERENCE", "", "ok"]) {
    assert.equal(fidelityOf(statsFor(label)).level, FIDELITY.UNMEASURED, label);
  }
});

test("movement is UNKNOWN until there are two deltas to compare", () => {
  assert.equal(convergenceOf(null).level, CONVERGENCE.UNKNOWN);
  assert.equal(convergenceOf({ measurable: false, stalled: false }).level, CONVERGENCE.UNKNOWN);
});

test("movement reads STALLED or IMPROVING, and says nothing about fidelity", () => {
  const stalled = convergenceOf({ measurable: true, stalled: true, materialPercent: 0.25, moves: [] });
  const moving = convergenceOf({ measurable: true, stalled: false, materialPercent: 0.25, moves: [] });
  assert.equal(stalled.level, CONVERGENCE.STALLED);
  assert.equal(moving.level, CONVERGENCE.IMPROVING);
  // Neither carries a fidelity opinion — that independence is the whole point.
  assert.equal(stalled.fidelity, undefined);
  assert.equal(moving.fidelity, undefined);
});

test("CRITICAL is never READY, at any movement", () => {
  for (const level of [CONVERGENCE.IMPROVING, CONVERGENCE.STALLED, CONVERGENCE.UNKNOWN]) {
    const out = reconcileVerdict({
      claimed: "READY_FOR_APPROVAL",
      fidelity: fidelityOf(statsFor("CRITICAL", { percent: 14.174, parityScore: 43 })),
      convergence: { level, materialPercent: 0.25, moves: [] },
    });
    assert.equal(out.verdict, "REVISE", level);
    assert.match(out.reason, /CRITICAL classification is never/);
  }
});

test("MAJOR is never READY, and a stalled one is named a stall", () => {
  const stalled = reconcileVerdict({
    claimed: "READY_FOR_APPROVAL",
    fidelity: fidelityOf(statsFor("MAJOR", { percent: 4.19 })),
    convergence: { level: CONVERGENCE.STALLED, materialPercent: 0.25, moves: [] },
  });
  assert.equal(stalled.verdict, "REVISE");
  assert.match(stalled.reason, /stall, not a finish/);

  const moving = reconcileVerdict({
    claimed: "READY_FOR_APPROVAL",
    fidelity: fidelityOf(statsFor("MAJOR", { percent: 4.19 })),
    convergence: { level: CONVERGENCE.IMPROVING, materialPercent: 0.25, moves: [] },
  });
  assert.equal(moving.verdict, "REVISE");
  assert.doesNotMatch(moving.reason, /stall, not a finish/);
});

test("PASS and UNMEASURED leave the claimed verdict untouched", () => {
  for (const stats of [statsFor("MINOR"), statsFor("IDENTICAL"), null]) {
    const out = reconcileVerdict({
      claimed: "READY_FOR_APPROVAL",
      fidelity: fidelityOf(stats),
      convergence: convergenceOf(null),
    });
    assert.equal(out.verdict, "READY_FOR_APPROVAL");
    assert.equal(out.reason, null);
  }
});

test("the measurement may refuse a verdict; it may never grant one", () => {
  // A page the comparator is happy with does not overrule a review that asked
  // for another pass: the review may have seen what the diff cannot.
  for (const classification of ["IDENTICAL", "MINOR", "MAJOR", "CRITICAL"]) {
    for (const claimed of ["REVISE", "BLOCKED", "CONVERGENCE_LIMIT_REACHED"]) {
      const out = reconcileVerdict({
        claimed,
        fidelity: fidelityOf(statsFor(classification)),
        convergence: convergenceOf(null),
      });
      assert.equal(out.verdict, claimed, `${claimed} + ${classification}`);
      assert.equal(out.reason, null);
    }
  }
});

test("a stalled sweep inside one revision is movement evidence too", () => {
  // The nora-bennett-cv shape: six renders in one folder, so there are no
  // cross-revision deltas at all and the chain-level signal is silent.
  const sweep = { renders: 6, stalled: true, trail: [14.0, 14.2, 14.28, 14.24, 14.17, 14.17] };
  assert.equal(convergenceOf(null, sweep).level, CONVERGENCE.STALLED);
  assert.equal(convergenceOf(null, sweep).source, "sweep");

  // Under three renders a sweep has fewer than two deltas and says nothing.
  assert.equal(convergenceOf(null, { renders: 2, stalled: true }).level, CONVERGENCE.UNKNOWN);

  // Either axis alone is enough to call a stall; agreement is not required.
  const moving = { measurable: true, stalled: false, materialPercent: 0.25, moves: [] };
  assert.equal(convergenceOf(moving, sweep).level, CONVERGENCE.STALLED);
  assert.equal(convergenceOf(moving, { renders: 6, stalled: false }).level, CONVERGENCE.IMPROVING);
});

test("a stall with nothing to measure says so, rather than saying 'null%'", () => {
  // The chain-level stall: a loop that changes focus every pass leaves fewer
  // than two comparable moves, so `diminishingReturns` returns no
  // `materialPercent` at all and `regressed` is what makes it STALLED.
  const verdict = reconcileVerdict({
    claimed: "READY_FOR_APPROVAL",
    fidelity: { level: FIDELITY.NEEDS_WORK, classification: "MAJOR", percent: 6.2, parityScore: 75, ssim: null },
    convergence: { level: CONVERGENCE.STALLED, materialPercent: null, moves: [], source: "chain" },
  });

  assert.equal(verdict.verdict, "REVISE");
  assert.doesNotMatch(verdict.reason, /null/);
  assert.match(verdict.reason, /bought no measurable movement/);
});

test("a stall that does have a figure still quotes it", () => {
  const verdict = reconcileVerdict({
    claimed: "READY_FOR_APPROVAL",
    fidelity: { level: FIDELITY.NEEDS_WORK, classification: "MAJOR", percent: 6.2, parityScore: 75, ssim: null },
    convergence: { level: CONVERGENCE.STALLED, materialPercent: 0.25, moves: [], source: "focus" },
  });

  assert.match(verdict.reason, /moved it by less than 0\.25%/);
});
