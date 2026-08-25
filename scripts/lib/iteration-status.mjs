#!/usr/bin/env node
/**
 * scripts/lib/iteration-status.mjs — how far has this loop got, and may it
 * keep going?
 *
 * The bounds in config/pipeline.json were declared in Phase 1 and enforced by
 * nobody: an agent could iterate forever, or keep re-attempting the same
 * mismatch, and the only thing standing in the way was its own judgement.
 * Judgement is exactly what a loop that is not converging has already lost.
 *
 * This module counts, from what is on disk, three things the limits are about:
 *
 *   iterations                how many revisions this loop has produced
 *   consecutiveBuildFailures  how many of the most recent ones did not build
 *   sameMismatchAttempts      how many of the most recent ones failed the SAME way
 *
 * The last one is why mismatch ids must be stable across iterations: three
 * passes that each rename the problem look like progress and are not.
 *
 * A loop runs from just after the most recent APPROVED ancestor to the target
 * revision, so approving resets the count — a new round of work is not
 * penalised for the previous one.
 */

import fs from "node:fs";
import path from "node:path";

import { describeSeal, sealState } from "./revision-seal.mjs";

/** Verdicts this module can return, in the order they end the loop. */
export const VERDICTS = Object.freeze(["READY_FOR_APPROVAL", "REVISE", "BLOCKED"]);

export class IterationStatusError extends Error {
  constructor(message) {
    super(`[iterate-status] ${message}`);
    this.name = "IterationStatusError";
  }
}

function readJsonOr(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Walk parents from `revisionId` back to the start of the current loop.
 *
 * @returns {Array<{ id: string, revision: object, review: object|null }>} oldest first
 */
function loadLoop(projectDir, revisionId) {
  const chain = [];
  const seen = new Set();
  let cursor = revisionId;
  let truncatedAt = null;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new IterationStatusError(`revision chain loops at ${cursor}`);
    }
    seen.add(cursor);

    const dir = path.join(projectDir, "revisions", cursor);
    const revision = readJsonOr(path.join(dir, "revision.json"));
    if (!revision) {
      // Only a truncation if we were following a parent link. Stopping here
      // silently would UNDER-count the loop, which makes every bound below more
      // permissive exactly when the project is in a damaged state, so the
      // caller is told the count is a lower bound.
      if (chain.length > 0) truncatedAt = cursor;
      break;
    }

    // An APPROVED ancestor is where the previous loop ended; the current loop
    // starts after it, so stop before including it.
    if (revision.status === "APPROVED" && cursor !== revisionId) break;

    chain.unshift({
      id: cursor,
      revision,
      review: readJsonOr(path.join(dir, "visual-review.json")),
    });
    cursor = revision.parentRevisionId;
  }
  return { chain, truncatedAt };
}

/**
 * What the next pass should be about.
 *
 * A difference the user named outranks the measured largest one. That is the
 * whole point of the override: when a person says "the timeline looks wrong",
 * the loop must not spend the next pass on whatever happens to occupy the most
 * pixels. It stays in front until a review marks it addressed, so it cannot be
 * lost to a louder measured mismatch appearing.
 */
function focusOf(entry) {
  const review = entry.review;
  if (!review) return { id: null, source: null };

  const reported = review.humanReportedMismatch;
  if (reported?.id && reported.addressed !== true) {
    return { id: reported.id, source: "human" };
  }
  if (review.largestMismatch) return { id: review.largestMismatch, source: "measured" };
  const first = Array.isArray(review.mismatches) ? review.mismatches[0] : null;
  return { id: first?.id ?? null, source: first ? "measured" : null };
}

/** The mismatch this pass was about, if the review named one. */
function mismatchOf(entry) {
  return focusOf(entry).id;
}

/**
 * What the bound counts as "the same thing again".
 *
 * The root cause, when the review records one. Counting ids alone would let a
 * loop chase three symptoms of one cause and reset the counter every pass —
 * the bound exists precisely to catch that, so it must see through the
 * symptoms to the cause.
 */
function focusKeyOf(entry) {
  const id = mismatchOf(entry);
  if (!id) return null;
  const mismatches = Array.isArray(entry.review?.mismatches) ? entry.review.mismatches : [];
  const named = mismatches.find((m) => m.id === id);
  return named?.rootCause ?? id;
}

function isBuildFailure(entry) {
  const { revision } = entry;
  if (revision.failure?.category === "BUILD_FAILED") return true;
  return revision.status === "FAILED" && revision.failure?.stage === "compile";
}

/** Length of the trailing run for which `predicate` holds. */
function trailingRun(chain, predicate) {
  let run = 0;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (!predicate(chain[i])) break;
    run += 1;
  }
  return run;
}

/**
 * Was this revision's render ever compared against anything?
 *
 * The whole measurement layer — the page diff, the footer band, the border
 * topology, the link and integrity gates — runs inside `render-and-diff`, and
 * nothing required it to have run. An agent that shelled out to Maven itself,
 * looked at the PDF and wrote a review by eye produced a revision the harness
 * accepted: a real proposal run reached `visual-review.json` with seven
 * mismatches and carried no `diff.png`, no `reference-scaled.png` and no
 * `visual-diff-stats.json` at all. Every gate was optional in practice, because
 * skipping one command skipped all of them.
 *
 * Judging the render is still judgement. Having measured it first is not.
 *
 * @returns {{ rendered: boolean, measured: boolean }}
 */
export function measurementEvidence(revisionDir) {
  const has = (name) => fs.existsSync(path.join(revisionDir, name));
  return {
    rendered: has("output.pdf") || has("output.png"),
    // Any one of them: the stats are what the diff writes, and the images are
    // what a reviewer opens. A revision carrying none of the three was not
    // compared with anything.
    measured: has("visual-diff-stats.json") || has("diff.png") || has("reference-scaled.png"),
  };
}

/**
 * Compute the loop status for one project.
 *
 * @param {{ projectDir: string, config: object, revisionId?: string|null }} options
 * @returns {object} status report; `verdict` is the decision, `reasons` explains it
 */
export function computeIterationStatus({ projectDir, config, revisionId = null }) {
  const project = readJsonOr(path.join(projectDir, "template-project.json"));
  if (!project) {
    throw new IterationStatusError(`no template-project.json in ${projectDir}`);
  }

  const target = revisionId ?? project.currentDraftRevisionId ?? project.currentApprovedRevisionId;
  if (!target) {
    throw new IterationStatusError(
      "the project has no current draft and no approved revision; nothing to report on",
    );
  }

  const { chain, truncatedAt } = loadLoop(projectDir, target);
  if (chain.length === 0) {
    throw new IterationStatusError(`revision ${target} not found in ${projectDir}`);
  }

  const latest = chain[chain.length - 1];
  const focus = focusOf(latest);
  const largestMismatch = focus.id;
  const focusKey = focusKeyOf(latest);

  const iterations = chain.length;
  const consecutiveBuildFailures = trailingRun(chain, isBuildFailure);
  const sameMismatchAttempts = focusKey
    ? trailingRun(chain, (entry) => focusKeyOf(entry) === focusKey)
    : 0;

  const limits = config.limits;
  const reasons = [];

  // Start from what the review said, then let the bounds override it.
  let verdict = latest.review?.verdict ?? "REVISE";
  let failureCategory = latest.review?.failureCategory ?? null;


  if (!latest.review) {
    reasons.push(
      `${latest.id} has no visual-review.json — a render without a review is not an iteration, ` +
        "it is an unfinished one",
    );
  }

  // A revision edited after it was judged is not the revision that was judged.
  // The render gate stops the second render; the edit happens before it, so the
  // loop has to be able to say that the source and the review have parted.
  const seal = sealState(path.join(projectDir, "revisions", latest.id));
  if (seal.broken) {
    reasons.push(`${latest.id}: ${describeSeal(seal)}`);
    if (verdict === "READY_FOR_APPROVAL") verdict = "REVISE";
  }

  // A render nobody compared cannot be ready. The review may be perfectly
  // observant — the one that prompted this carried seven real mismatches — but
  // "ready" is a claim about parity with the reference, and parity is the one
  // thing looking at the render alone cannot establish. REVISE rather than
  // BLOCKED: the agent fixes this itself, in one command.
  const evidence = measurementEvidence(path.join(projectDir, "revisions", latest.id));
  const unmeasuredRender = evidence.rendered && !evidence.measured;
  if (unmeasuredRender) {
    reasons.push(
      `${latest.id} has a render and no comparison — no visual-diff-stats.json, no diff.png, ` +
        "no reference-scaled.png. Every gate lives in render-and-diff, so skipping it skipped " +
        "the page diff, the footer band, the border topology, the links and the integrity check",
    );
    if (verdict === "READY_FOR_APPROVAL") verdict = "REVISE";
  }

  if (truncatedAt) {
    reasons.push(
      `the chain stops at ${truncatedAt}, whose revision.json is missing or unreadable — ` +
        `${iterations} is a LOWER BOUND on the iterations this loop has run, so the limits ` +
        "below are more permissive than they look",
    );
  }

  if (verdict !== "READY_FOR_APPROVAL") {
    // READY wins over the bounds: a loop that reached parity on its last
    // allowed pass has succeeded, and blocking it would be perverse.
    if (consecutiveBuildFailures >= limits.maxConsecutiveBuildFailures) {
      verdict = "BLOCKED";
      failureCategory = "BUILD_FAILED";
      reasons.push(
        `${consecutiveBuildFailures} consecutive build failures (limit ${limits.maxConsecutiveBuildFailures})`,
      );
    } else if (sameMismatchAttempts >= limits.maxSameMismatchAttempts) {
      verdict = "BLOCKED";
      failureCategory = "VISUAL_MISMATCH";
      // Attribute it truthfully. When the focus came from the user, the passes
      // in between may have worked on other things — what survived is their
      // report, not necessarily the same attempt repeated.
      reasons.push(
        focus.source === "human"
          ? `what the user reported ("${largestMismatch}") is still open after ` +
            `${sameMismatchAttempts} passes (limit ${limits.maxSameMismatchAttempts}) — ` +
            "stop and ask them, rather than guessing again"
          : `"${largestMismatch}" has survived ${sameMismatchAttempts} attempts ` +
            `(limit ${limits.maxSameMismatchAttempts}) — the next attempt would be the same attempt`,
      );
    } else if (iterations >= limits.maxIterations) {
      verdict = "BLOCKED";
      failureCategory = "ITERATION_LIMIT";
      reasons.push(`${iterations} iterations (limit ${limits.maxIterations})`);
    }
  }

  if (verdict === "BLOCKED" && !failureCategory) failureCategory = "VISUAL_MISMATCH";

  return {
    project: project.displayName ?? path.basename(projectDir),
    revision: latest.id,
    loopStartedAfter: chain[0].revision.parentRevisionId ?? null,
    verdict,
    failureCategory,
    // The fact, not the consequence. Reporting only "was the verdict
    // downgraded" reads as "this was measured" on a revision whose review had
    // already said REVISE, which is the opposite of what happened.
    measurement: evidence,
    // Whether the source still matches what the review judged.
    seal: { reviewed: seal.reviewed, broken: seal.broken, edited: seal.edited },
    // The next command differs: "fix this mismatch" and "you have not compared
    // anything yet" are not the same instruction.
    // Both of these outrank a named mismatch: fixing the mismatch is pointless
    // while the render is uncompared or the source has parted from its review.
    largestMismatch: unmeasuredRender
      ? "unmeasured-render"
      : seal.broken
        ? "edited-after-review"
        : largestMismatch,
    // Named so a caller can say "because you asked" rather than reporting a
    // user's own observation back to them as a measurement.
    focusSource: focus.source,
    rootCause: focusKey !== largestMismatch ? focusKey : null,
    iterations,
    iterationsAreLowerBound: Boolean(truncatedAt),
    chainTruncatedAt: truncatedAt,
    consecutiveBuildFailures,
    sameMismatchAttempts,
    limits,
    remaining: {
      iterations: Math.max(0, limits.maxIterations - iterations),
      buildFailures: Math.max(0, limits.maxConsecutiveBuildFailures - consecutiveBuildFailures),
      sameMismatch: Math.max(0, limits.maxSameMismatchAttempts - sameMismatchAttempts),
    },
    chain: chain.map((entry) => ({
      id: entry.id,
      status: entry.revision.status,
      verdict: entry.review?.verdict ?? null,
      mismatch: mismatchOf(entry),
    })),
    reasons,
  };
}
