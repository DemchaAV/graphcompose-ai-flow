#!/usr/bin/env node
/**
 * scripts/lib/review-claims.mjs — does the review's verdict survive contact
 * with what was measured?
 *
 * The loop's exit condition used to be a self-report, and the route it took to
 * become one is worth writing down, because every part of it looked reasonable:
 *
 *   1. the model writes visual-review.json, verdict and all;
 *   2. iterate-status reads that verdict and starts from it;
 *   3. render-and-diff asks iterate-status for the loop verdict.
 *
 * So the machine's answer to "may this loop stop?" was the model's own answer,
 * round-tripped through two tools that each looked like they were checking it.
 * A real run ended on:
 *
 *     "gate": { "passed": false, "metric": "diff: 211583 px (9.734%) — CRITICAL" }
 *     "verdict": "READY_FOR_APPROVAL"
 *
 * and nothing anywhere noticed, because the only reader of `gate.passed` in the
 * whole repository was the markdown renderer that prints it back out.
 *
 * This module is the missing reader. It does not form a verdict — judging a
 * render against a design reference is judgement, and that stays with the
 * model. It asks the narrower question a machine can answer: is this verdict
 * consistent with the evidence sitting in the same folder?
 *
 * Four ways it is not:
 *
 *   binary-gate-failed      exact-diff and region-diff measure equality. Their
 *                           `passed: false` is a fact, not an opinion, and
 *                           READY cannot stand on top of it.
 *   unresolved-severity     a CRITICAL or MAJOR mismatch on the list IS the
 *                           definition of not ready. The honest way out is to
 *                           reclassify with a reason, not to outrank it.
 *   human-report-open       the user named a difference and the review has not
 *                           marked it addressed. READY is a claim about their
 *                           observation that the review declined to make.
 *   gate-metric-unmeasured  the pixel count quoted in the review is not the one
 *                           visual-diff wrote to disk. The number is quoted
 *                           verbatim precisely so this comparison is possible.
 *
 * Deliberately NOT a rule: `passed: false` on the `visual-review` gate kind.
 * That gate compares against a rasterised design image whose anti-aliasing no
 * PDF renderer reproduces, so its page percentage is never zero and a
 * pass/fail read off it means nothing — the schema says as much about
 * pixelSimilaritySignal already. Blocking on it would make the override a
 * rubber stamp on every reference-built project, which is the failure this
 * module exists to prevent, reintroduced one level up.
 */

import fs from "node:fs";
import path from "node:path";

/** Gate kinds whose rule is an equality measurement rather than a judgement. */
const BINARY_GATES = Object.freeze(["exact-diff", "region-diff"]);

/** Severities that are, by their own definition, not ready for approval. */
const BLOCKING_SEVERITIES = Object.freeze(["CRITICAL", "MAJOR"]);

/** Shortest override reason that can carry an argument rather than a shrug. */
export const MIN_OVERRIDE_REASON = 60;

function readJsonOr(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Is there a human-signed override, and is it substantial enough to be one?
 *
 * Same shape as an observation's retiredNote: a length floor is a crude proxy
 * for an argument, but it does reliably separate "the parent render is one
 * pixel wide of ours because FreeType hints the stem differently on this
 * machine, verified by rendering both twice" from "ok".
 */
function overrideState(gate) {
  const override = gate?.override;
  if (!override) return { present: false, valid: false, reason: null };
  const reason = typeof override.reason === "string" ? override.reason.trim() : "";
  return {
    present: true,
    valid: reason.length >= MIN_OVERRIDE_REASON,
    reason: reason || null,
  };
}

/**
 * Which comparison produced this stats file, read from what it compared.
 *
 * `visual-diff-stats.json` records the reference image it was given. A
 * reference comparison scales the project's own reference into the revision
 * folder, so that path lives inside it; a parent comparison is handed the
 * PARENT revision's `output.png`, which does not. The file therefore says
 * which of the two it is without needing a new field, and without trusting
 * anything the model wrote.
 *
 * @returns {"reference"|"parent"|null} null when the file cannot say
 */
function comparisonOf(stats, revisionDir) {
  if (!stats || typeof stats.reference !== "string" || stats.reference.length === 0) return null;
  const compared = path.resolve(stats.reference);
  const here = path.resolve(revisionDir);
  const inside = compared === here || compared.startsWith(here + path.sep);
  return inside ? "reference" : "parent";
}

/**
 * Audit one review against the evidence beside it.
 *
 * @param {{ revisionDir: string, review: object|null }} options
 * @returns {{ blocking: Array<{id: string, detail: string}>, lifted: Array<{id: string, reason: string}> }}
 *   `blocking` is empty when the verdict is consistent with the evidence.
 *   `lifted` records rules a valid override waived, so the caller can say so
 *   rather than silently reporting a clean audit.
 */
export function auditReviewClaims({ revisionDir, review }) {
  const blocking = [];
  const lifted = [];
  if (!review) return { blocking, lifted };

  const gate = review.gate ?? null;
  const override = overrideState(gate);

  // --- binary-gate-failed -------------------------------------------------
  if (gate && BINARY_GATES.includes(gate.kind) && gate.passed === false) {
    const metric = gate.metric ? ` — ${gate.metric}` : "";
    if (override.valid) {
      lifted.push({ id: "binary-gate-failed", reason: override.reason });
    } else if (override.present) {
      blocking.push({
        id: "binary-gate-failed",
        detail:
          `the ${gate.kind} gate did not pass${metric}, and gate.override carries ` +
          `${override.reason ? `${override.reason.length} characters` : "no reason"} — ` +
          `an override needs at least ${MIN_OVERRIDE_REASON}, naming what was measured ` +
          "instead and why that measurement is acceptable",
      });
    } else {
      blocking.push({
        id: "binary-gate-failed",
        detail:
          `the ${gate.kind} gate did not pass${metric}. That gate measures equality, so its ` +
          "verdict is a fact: either fix the difference, or record a gate.override saying why " +
          "this particular inequality is acceptable",
      });
    }
  }

  // --- unresolved-severity ------------------------------------------------
  const mismatches = Array.isArray(review.mismatches) ? review.mismatches : [];
  const severe = mismatches.filter((m) => BLOCKING_SEVERITIES.includes(m?.severity));
  if (severe.length) {
    blocking.push({
      id: "unresolved-severity",
      detail:
        `${severe.length} mismatch(es) still classified ` +
        `${[...new Set(severe.map((m) => m.severity))].join("/")}: ` +
        `${severe.map((m) => m.id ?? "(unnamed)").join(", ")}. ` +
        "Fix them, or reclassify with the reason that makes the lower severity true — " +
        "no override lifts this one, because outranking a CRITICAL is how a review stops " +
        "meaning anything",
    });
  }

  // --- human-report-open --------------------------------------------------
  const reported = review.humanReportedMismatch;
  if (reported?.id && reported.addressed !== true) {
    blocking.push({
      id: "human-report-open",
      detail:
        `the user reported "${reported.id}" and this review does not mark it addressed. ` +
        "Set addressed: true once a pass has resolved it — READY is a claim about their " +
        "observation, so it cannot be made while the report is still open",
    });
  }

  // --- gate-metric-unmeasured ---------------------------------------------
  // Page 1 only: visual-diff writes one stats file, for the page every
  // downstream tool reads. Claims about later pages have nothing on disk to
  // check them against yet, and inventing a mismatch there would be the same
  // sin in the other direction.
  //
  // And only when the file records the SAME comparison the review is
  // describing. `visual-diff-stats.json` is rewritten by whichever diff ran
  // last, reference or parent alike, so a revision diffed both ways leaves
  // stats for one of them. Checking a parent claim against reference stats
  // would report a fabrication where there is only a stale file — this rule
  // exists to catch a number nobody measured, not a number measured twice.
  const stats = readJsonOr(path.join(revisionDir, "visual-diff-stats.json"));
  const claimedPage1 = (Array.isArray(gate?.pages) ? gate.pages : []).find((p) => p?.page === 1);
  const statsComparedAgainst = comparisonOf(stats, revisionDir);
  const sameComparison =
    statsComparedAgainst !== null &&
    (review.comparedAgainst ?? statsComparedAgainst) === statsComparedAgainst;

  if (
    stats &&
    sameComparison &&
    Number.isFinite(stats.mismatchPx) &&
    Number.isFinite(claimedPage1?.mismatchPixels)
  ) {
    if (claimedPage1.mismatchPixels !== stats.mismatchPx) {
      blocking.push({
        id: "gate-metric-unmeasured",
        detail:
          `the review reports ${claimedPage1.mismatchPixels} mismatched pixels on page 1 and ` +
          `visual-diff-stats.json records ${stats.mismatchPx}. The metric is quoted verbatim so ` +
          "that these two can be compared; when they differ, the review is describing a " +
          "comparison that was not the one that ran",
      });
    }
  }

  return { blocking, lifted };
}
