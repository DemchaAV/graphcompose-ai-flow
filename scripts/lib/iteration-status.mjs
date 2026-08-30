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
 *
 * Counting is only half of it. The verdict this module starts from is the one
 * the review wrote, and for a long time nothing checked that claim against the
 * evidence lying beside it — so READY meant "the model typed READY". The
 * checks below ask, in order: was the review present, was the render measured,
 * has the source drifted from what was judged, and finally (review-claims.mjs)
 * does what the review SAYS agree with what was measured.
 */

import fs from "node:fs";
import path from "node:path";

import { auditReviewClaims } from "./review-claims.mjs";
import { describeSeal, sealState } from "./revision-seal.mjs";
import { describeAttempts, readAttempts } from "./attempts.mjs";
import { coveringLimitation, readLimitations } from "./limitations.mjs";

/** Verdicts this module can return, in the order they end the loop. */
export const VERDICTS = Object.freeze([
  "READY_FOR_APPROVAL",
  "REVISE",
  "CONVERGENCE_LIMIT_REACHED",
  "BLOCKED",
]);

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
      // What the pass actually measured, so "is this still moving?" is a
      // question about pixels rather than about how many mismatches the review
      // chose to list. A pass can rename its findings and look like progress.
      stats: readJsonOr(path.join(dir, "visual-diff-stats.json")),
      // Every render-and-diff run on this revision, not just the last one the
      // stats file describes. A revision rendered ten times is ten measurements,
      // and the bounds below are about measurements, not folders.
      attempts: readAttempts(dir),
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
function focusOf(entry, limitations = []) {
  const review = entry.review;
  if (!review) return { id: null, source: null, skipped: [] };

  const reported = review.humanReportedMismatch;
  if (reported?.id && reported.addressed !== true) {
    return { id: reported.id, source: "human", skipped: [] };
  }

  // An accepted limitation is never the focus. The corpus spent its same-cause
  // budget on "substituted typeface" with the action "none available on this
  // line" in eight projects — a fact about the fonts, re-litigated every pass
  // while the defects a person later found waited behind it. Once accepted,
  // the loop looks past it to the next mismatch the review actually rated.
  const mismatches = Array.isArray(review.mismatches) ? review.mismatches : [];
  const skipped = [];
  const covered = (id) => {
    const m = mismatches.find((x) => x?.id === id) ?? { id };
    const hit = coveringLimitation(limitations, {
      id: m.id,
      rootCause: m.rootCause ?? null,
      region: m.region ?? null,
      cause: m.cause ?? null,
    });
    if (hit) skipped.push({ id, limitation: hit.id });
    return Boolean(hit);
  };

  if (review.largestMismatch && !covered(review.largestMismatch)) {
    return { id: review.largestMismatch, source: "measured", skipped };
  }
  // The next one the review rated blocking, then the next one at all.
  const ranked = [
    ...mismatches.filter((m) => m?.severity === "CRITICAL" || m?.severity === "MAJOR"),
    ...mismatches.filter((m) => m?.severity !== "CRITICAL" && m?.severity !== "MAJOR"),
  ];
  for (const m of ranked) {
    if (!m?.id || m.id === review.largestMismatch) continue;
    if (!covered(m.id)) return { id: m.id, source: "measured", skipped };
  }
  return { id: null, source: skipped.length > 0 ? "measured" : null, skipped };
}

/** The mismatch this pass was about, if the review named one. */
function mismatchOf(entry, limitations = []) {
  return focusOf(entry, limitations).id;
}

/**
 * What the bound counts as "the same thing again".
 *
 * The root cause, when the review records one. Counting ids alone would let a
 * loop chase three symptoms of one cause and reset the counter every pass —
 * the bound exists precisely to catch that, so it must see through the
 * symptoms to the cause.
 */
function focusKeyOf(entry, limitations = []) {
  const id = mismatchOf(entry, limitations);
  if (!id) return null;
  const mismatches = Array.isArray(entry.review?.mismatches) ? entry.review.mismatches : [];
  const named = mismatches.find((m) => m.id === id);
  return named?.rootCause ?? id;
}

/**
 * How many mismatches on this pass were, by their own classification, not
 * ready for approval.
 *
 * The same two severities review-claims.mjs blocks READY on, deliberately: the
 * loop's definition of "converging" should be the loop's definition of "done",
 * one step at a time. Anything else invents a second standard.
 *
 * `null`, not 0, when there is nothing to count. `mismatches` is required by
 * the schema, so a review without it is a damaged record — and reading a
 * damaged record as "zero blocking mismatches" would hand out an iteration
 * extension for having written a worse file.
 */
function blockingSeverityCount(entry, limitations = []) {
  const mismatches = entry.review?.mismatches;
  if (!Array.isArray(mismatches)) return null;
  return mismatches.filter(
    (m) =>
      (m?.severity === "CRITICAL" || m?.severity === "MAJOR") &&
      !coveringLimitation(limitations, {
        id: m.id,
        rootCause: m.rootCause ?? null,
        region: m.region ?? null,
        cause: m.cause ?? null,
      }),
  ).length;
}

/**
 * Which passes exist because the user said something, rather than because the
 * loop decided to go round again.
 *
 * A pass the user asked for is not the agent circling, and charging it to the
 * agent's budget is how a real run reached "9/8" for a correction the user had
 * just requested. Only the FIRST appearance of a report id is free: if the
 * agent then takes three passes at that one report, the other two are its own,
 * which keeps an unaddressed report from becoming unlimited licence.
 *
 * BUT: nothing on disk proves a person spoke. `humanReportedMismatch` is
 * written by the same model whose verdict this module stopped trusting, and
 * the schema deliberately allows coining a fresh id ("coin one when they are
 * not"). An agent that coins a new one every pass would hold `agentIterations`
 * at zero and never reach the ceiling — the self-report closed at the verdict,
 * reopened at the budget. So exemptions are BOUNDED as well as deduplicated:
 * the caller caps them, and past the cap the passes are charged like any
 * other. A person with more than that many corrections can approve, which
 * resets the loop, or say so — both of which put a human in the path, which is
 * the thing the exemption was pretending to detect.
 */
function humanDirectedPasses(chain) {
  const seen = new Set();
  const directed = [];
  for (const entry of chain) {
    const id = entry.review?.humanReportedMismatch?.id;
    if (!id) continue;
    if (!seen.has(id)) {
      seen.add(id);
      directed.push({ revision: entry.id, report: id });
    }
  }
  return directed;
}

/**
 * Did the most recent pass reduce the number of blocking mismatches?
 *
 * Note what this deliberately does NOT use: the page pixel count. A pass that
 * capped a timeline rail with its marker — a real, visible structural fix —
 * moved the page total from 211583 px to 211674, i.e. UP, because the fix
 * repainted a few glyph edges. A convergence test built on that number would
 * have called the fix a regression. The severity ledger is what the review
 * actually reasoned about, so it is what progress is measured on.
 */
function convergence(chain, limitations = []) {
  const unmeasurable = { measurable: false, converging: false, from: null, to: null };
  if (chain.length < 2) return unmeasurable;

  // The LATEST revision, not the latest one that happens to carry a review.
  // Taking the last reviewed pass would let a loop whose newest revision has
  // no review at all be granted an extension on the strength of an older one,
  // and the reason string would say "the last pass closed N" about a pass that
  // is not the last one.
  const latest = blockingSeverityCount(chain[chain.length - 1], limitations);
  const previous = blockingSeverityCount(chain[chain.length - 2], limitations);
  if (latest === null || previous === null) return unmeasurable;

  return { measurable: true, converging: latest < previous, from: previous, to: latest };
}

/**
 * What has already been tried against the mismatch in front, and what it moved.
 *
 * ## Why
 *
 * `sameMismatchAttempts` counts passes and stops the loop at three. Counting is
 * enough to prevent circling forever and is not enough to prevent repeating: a
 * run spent three revisions on one wrapped label, moving a shared constant to
 * 8.5, then 8.65, then reasoning its way back toward 8.5 — a value it had
 * already rendered and measured. Nothing on disk said what had been tried,
 * because the attempts are spread one per revision and nobody had put them in a
 * row.
 *
 * This is that row: for each pass that failed the same way, the action its
 * review recorded and the page difference it produced.
 *
 * @param {Array<object>} chain
 * @param {string|null} focusKey the cause currently in front
 * @returns {Array<{revision:string, mismatch:string|null, action:string|null,
 *                  percent:number|null, moved:number|null}>}
 */
export function attemptHistory(chain, focusKey, limitations = []) {
  if (!focusKey) return [];

  const run = [];
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (focusKeyOf(chain[i], limitations) !== focusKey) break;
    run.unshift(chain[i]);
  }

  return run.map((entry, index) => {
    const focus = focusOf(entry, limitations);
    const mismatch = (entry.review?.mismatches ?? []).find((m) => m.id === focus.id) ?? null;
    const percent = typeof entry.stats?.percent === "number" ? round(entry.stats.percent, 3) : null;
    const before = index > 0 ? run[index - 1] : null;
    const beforePercent = typeof before?.stats?.percent === "number" ? before.stats.percent : null;
    return {
      revision: entry.id,
      mismatch: focus.id,
      // Trimmed: the action is a paragraph in the review and a line here. What
      // a reader needs is which lever was pulled, not the argument for it.
      action: mismatch?.action ? firstSentence(mismatch.action) : null,
      percent,
      moved: percent !== null && beforePercent !== null ? round(percent - beforePercent, 3) : null,
    };
  });
}

/**
 * Are the passes still buying anything?
 *
 * <p>Two attempts that each move the page difference by less than a quarter of
 * a percentage point are not converging on a fix; they are paying a full pass
 * for a change nobody can see. The loop's own same-cause bound would still let
 * a third one run.</p>
 *
 * <p>Evidence, not a verdict. It says the movement has stopped and leaves what
 * to do about it — accept the residual, change approach, ask the user — where
 * it belongs. A tool that ended the loop on this would end it on a threshold
 * somebody guessed.</p>
 *
 * @param {Array<{moved:number|null}>} history from {@link attemptHistory}
 * @param {number} materialPercent
 */
export function diminishingReturns(history, materialPercent) {
  const measured = history.filter((attempt) => attempt.moved !== null);
  if (measured.length < 2) return { measurable: false, stalled: false, moves: [] };

  const recent = measured.slice(-2);
  return {
    measurable: true,
    stalled: recent.every((attempt) => Math.abs(attempt.moved) < materialPercent),
    moves: recent.map((attempt) => ({ revision: attempt.revision, moved: attempt.moved })),
    materialPercent,
  };
}

function firstSentence(text) {
  const trimmed = String(text).trim();
  const stop = trimmed.search(/\.\s/);
  return stop > 0 ? trimmed.slice(0, stop + 1) : trimmed.slice(0, 160);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
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
  // What this project has decided not to fix. Read once, threaded through every
  // question below: the focus, the same-cause count, the blocking count, and
  // the claim audit all look past an accepted limitation.
  const limitations = readLimitations(projectDir);
  const focus = focusOf(latest, limitations);
  const largestMismatch = focus.id;
  const focusKey = focusKeyOf(latest, limitations);

  const iterations = chain.length;
  // The budget is about the agent circling, so it counts the agent's own
  // passes. The total is still reported — a reader wants to know how many
  // revisions this loop produced, not just how many were charged for.
  //
  // Capped, because the evidence for "the user asked for this" is a field the
  // agent writes. An uncapped exemption is an uncapped loop; see
  // humanDirectedPasses.
  const reported = humanDirectedPasses(chain);
  const exemptionCap = config.limits.maxIterationGrants;
  const humanDirected = reported.slice(0, exemptionCap);
  const exemptionsRefused = reported.slice(exemptionCap);
  const agentIterations = Math.max(0, iterations - humanDirected.length);
  const converged = convergence(chain, limitations);
  const consecutiveBuildFailures = trailingRun(chain, isBuildFailure);
  const sameMismatchAttempts = focusKey
    ? trailingRun(chain, (entry) => focusKeyOf(entry, limitations) === focusKey)
    : 0;

  const limits = config.limits;
  // What has already been tried against the cause in front, and whether those
  // attempts are still moving anything. Computed before the bounds so both the
  // bound's reason and the payload can name them.
  const history = attemptHistory(chain, focusKey, limitations);
  const stalling = diminishingReturns(history, limits.materialMovePercent ?? 0.25);
  const reasons = [];

  for (const skip of focus.skipped ?? []) {
    reasons.push(
      `"${skip.id}" is covered by the accepted limitation "${skip.limitation}" — not the focus, ` +
        "not counted toward the same-cause bound, and not blocking approval",
    );
  }

  // What the renders inside the revisions add up to. `iterations` counts
  // folders; this counts measurements, which is what the corpus showed the two
  // disagreeing about by a factor of seven. Evidence: it is reported and it
  // names a stalled sweep, but it ends nothing — a sweep over five type sizes
  // is a legitimate way to settle one, and the bound that catches circling is
  // the same-cause count on the reviews.
  const materialPercent = limits.materialMovePercent ?? 0.25;
  const perRevision = chain.map((entry) => ({
    revision: entry.id,
    ...describeAttempts(entry.attempts ?? [], materialPercent),
  }));
  const renders = {
    total: perRevision.reduce((sum, r) => sum + r.renders, 0),
    reruns: perRevision.reduce((sum, r) => sum + r.reruns, 0),
    perRevision,
    latest: perRevision[perRevision.length - 1] ?? null,
  };
  const latestRenders = renders.latest;
  if (latestRenders && latestRenders.renders >= 3 && latestRenders.stalled) {
    reasons.push(
      `${latest.id} has been rendered ${latestRenders.renders} times ` +
        `(${latestRenders.trail.map((p) => `${p}%`).join(" → ")}) and the last two moved under ` +
        `${materialPercent}% — a sweep that has stopped buying anything; settle it or change approach`,
    );
  }
  if (latestRenders && latestRenders.reruns > 0) {
    reasons.push(
      `${latest.id}: ${latestRenders.reruns} of its ${latestRenders.renders} renders had the same sources as ` +
        "the render before — re-runs that measured nothing new",
    );
  }
  /** Set when the iteration ceiling was lifted for a converging loop. */
  let grantedExtension = null;

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

  // A verdict has to agree with the evidence in its own folder. The three
  // checks above ask whether the review was DONE — sealed, measured, present.
  // None of them asked what it SAID, so a review could carry a failed gate, an
  // open user report or a pixel count nobody wrote and still end the loop by
  // typing READY. See review-claims.mjs for how that came to be structural
  // rather than careless.
  const claims = auditReviewClaims({
    revisionDir: path.join(projectDir, "revisions", latest.id),
    review: latest.review,
    limitations,
  });
  for (const lift of claims.lifted) {
    reasons.push(`${latest.id}: ${lift.id} waived by gate.override — ${lift.reason}`);
  }
  if (claims.blocking.length) {
    for (const claim of claims.blocking) {
      reasons.push(`${latest.id}: ${claim.detail}`);
    }
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
      // Not BLOCKED. The loop spent its own budget on one cause; a document
      // exists, it renders, and every gate but this one ran. A real run reached
      // a finished-looking CV here and was reported as unable to make progress
      // — which then refused the approval the user had already given and sent
      // it around the one path that records which verdict was approved over.
      // BLOCKED is for "no usable document can be produced"; this is "the loop
      // is done deciding and a person is not".
      verdict = "CONVERGENCE_LIMIT_REACHED";
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
      // What those attempts were. The bound says "stop"; this says what has
      // already been spent, so the report to the user names the values that
      // have been rendered and measured rather than proposing one of them again.
      if (history.length > 0) {
        reasons.push(
          `already tried: ${history
            .map((attempt) => `${attempt.revision} ${attempt.action ?? "(no action recorded)"}` +
              (attempt.percent === null ? "" : ` → ${attempt.percent}%`))
            .join("; ")}`,
        );
      }
    } else if (agentIterations >= limits.maxIterations) {
      // A loop still closing blocking mismatches is not the loop this bound was
      // written for. `maxSameMismatchAttempts` above is what catches circling —
      // it fires on the third attempt at one cause regardless of how many
      // passes have run — so a flat ceiling on top of it also stops work that
      // is demonstrably converging. A real run hit 8/8 holding two MINORs with
      // written recipes and stopped, and the recipes went into the README
      // instead of into the document.
      //
      // Grants are capped and have to be re-earned: each one requires the
      // latest pass to have strictly reduced the blocking count again.
      const grantsUsed = agentIterations - limits.maxIterations;
      const grantsLeft = Math.max(0, limits.maxIterationGrants - grantsUsed);

      if (converged.converging && grantsLeft > 0) {
        grantedExtension = { used: grantsUsed + 1, of: limits.maxIterationGrants, ...converged };
        reasons.push(
          `${agentIterations} agent passes is at the limit of ${limits.maxIterations}, and the ` +
            `last pass closed ${converged.from - converged.to} blocking mismatch(es) ` +
            `(${converged.from} -> ${converged.to}) — extension ${grantsUsed + 1} of ` +
            `${limits.maxIterationGrants}. The next pass must close another, or this stops`,
        );
      } else {
        // Same reasoning as the same-cause bound above: a loop out of passes
        // has a document and has run out of budget, which is not the same thing
        // as being unable to produce one.
        verdict = "CONVERGENCE_LIMIT_REACHED";
        failureCategory = "ITERATION_LIMIT";
        reasons.push(
          `${agentIterations} agent passes (limit ${limits.maxIterations})` +
            (humanDirected.length
              ? `, ${humanDirected.length} further pass(es) not charged because the user ` +
                `asked for them: ${humanDirected.map((h) => h.report).join(", ")}`
              : "") +
            (exemptionsRefused.length
              ? `; ${exemptionsRefused.length} further report(s) were charged anyway — ` +
                `only ${exemptionCap} exemptions are available, because nothing on disk ` +
                "proves a person spoke: " +
                exemptionsRefused.map((h) => h.report).join(", ")
              : "") +
            (grantsLeft <= 0
              ? `; all ${limits.maxIterationGrants} extensions are spent`
              : converged.measurable
                ? `; the last pass closed no blocking mismatch (${converged.from} -> ` +
                  `${converged.to}), so there is nothing to extend on`
                : "; there is no second reviewed pass to measure progress against"),
        );
      }
    }
  }

  // Both stopping verdicts owe a category: the schema requires one for BLOCKED,
  // and a loop that stopped on its budget should still say what it was working
  // on when it did.
  if ((verdict === "BLOCKED" || verdict === "CONVERGENCE_LIMIT_REACHED") && !failureCategory) {
    failureCategory = "VISUAL_MISMATCH";
  }

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
    // Whether the review's own claims survive the evidence beside them. Kept
    // as the audit rather than a boolean: "READY was downgraded" does not tell
    // the next pass which claim failed, and that is the whole instruction.
    claims: { blocking: claims.blocking, lifted: claims.lifted },
    // The next command differs: "fix this mismatch" and "you have not compared
    // anything yet" are not the same instruction.
    // Both of these outrank a named mismatch: fixing the mismatch is pointless
    // while the render is uncompared or the source has parted from its review.
    largestMismatch: unmeasuredRender
      ? "unmeasured-render"
      : seal.broken
        ? "edited-after-review"
        : // A blocked claim only becomes the focus when the review named
          // nothing: it is a reason the verdict cannot stand, not necessarily
          // the thing to fix, and overwriting a named mismatch with it would
          // also break the sameMismatchAttempts bound that counts on the name.
          (largestMismatch ?? claims.blocking[0]?.id ?? null),
    // Named so a caller can say "because you asked" rather than reporting a
    // user's own observation back to them as a measurement.
    focusSource: focus.source,
    rootCause: focusKey !== largestMismatch ? focusKey : null,
    iterations,
    // What the budget is actually measured against, and what was excused from
    // it. Reported separately so "9 revisions, 8 of them mine" is legible
    // rather than arriving as a single number that looks like an overrun.
    agentIterations,
    humanDirected,
    // Reports past the cap. Named rather than dropped: a loop that stopped
    // being excused should be able to say why, and a run that trips this is
    // either working with a very talkative user or coining ids per pass —
    // both of which a reader wants to see.
    exemptionsRefused,
    convergence: converged,
    grantedExtension,
    iterationsAreLowerBound: Boolean(truncatedAt),
    chainTruncatedAt: truncatedAt,
    consecutiveBuildFailures,
    sameMismatchAttempts,
    // The passes already spent on the cause in front, with what each of them
    // changed and what it measured. Counting them stops a loop from circling
    // forever; listing them stops the next pass from proposing a value that has
    // already been rendered.
    attempts: history,
    // Whether those passes are still buying anything. Evidence, never a
    // verdict: a threshold nobody measured should not be what ends a loop.
    diminishingReturns: stalling,
    // Renders inside the revisions, from attempts.json: the measurements the
    // folder count hides. `total` is what the loop actually paid for.
    renders,
    // What this project has decided not to fix, and which of the latest
    // review's mismatches that covered. Reported so a reader knows why the
    // focus is not the largest mismatch on the list.
    limitations: {
      active: limitations.map((l) => l.id),
      skipped: focus.skipped ?? [],
    },
    limits,
    remaining: {
      iterations: Math.max(0, limits.maxIterations - agentIterations),
      iterationGrants: Math.max(
        0,
        limits.maxIterationGrants - Math.max(0, agentIterations - limits.maxIterations),
      ),
      buildFailures: Math.max(0, limits.maxConsecutiveBuildFailures - consecutiveBuildFailures),
      sameMismatch: Math.max(0, limits.maxSameMismatchAttempts - sameMismatchAttempts),
    },
    chain: chain.map((entry) => ({
      id: entry.id,
      status: entry.revision.status,
      verdict: entry.review?.verdict ?? null,
      mismatch: mismatchOf(entry, limitations),
    })),
    reasons,
  };
}
