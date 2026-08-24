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

/** The mismatch this pass was about, if the review named one. */
function mismatchOf(entry) {
  const review = entry.review;
  if (!review) return null;
  if (review.largestMismatch) return review.largestMismatch;
  const first = Array.isArray(review.mismatches) ? review.mismatches[0] : null;
  return first?.id ?? null;
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
  const largestMismatch = mismatchOf(latest);

  const iterations = chain.length;
  const consecutiveBuildFailures = trailingRun(chain, isBuildFailure);
  const sameMismatchAttempts = largestMismatch
    ? trailingRun(chain, (entry) => mismatchOf(entry) === largestMismatch)
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
      reasons.push(
        `"${largestMismatch}" has survived ${sameMismatchAttempts} attempts ` +
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
    largestMismatch,
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
