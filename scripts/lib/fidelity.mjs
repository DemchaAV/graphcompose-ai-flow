/**
 * scripts/lib/fidelity.mjs — two independent axes, and the verdict they bound.
 *
 * ## Why this module exists
 *
 * `iteration-status` used to start from the verdict the review wrote and ask
 * only whether the review had been *done* — sealed, measured, present, its
 * claims internally consistent. None of those asked whether the render was
 * actually *close to the reference*, so a run reached `READY_FOR_APPROVAL` on
 * a page that differed by 14.17% of its pixels. The review quoted that number
 * correctly and called every mismatch MINOR; `review-claims` blocks a
 * self-declared CRITICAL or MAJOR, so labelling them MINOR walked past it.
 * Meanwhile `visual-diff-stats.json` carried `classification: "CRITICAL"`,
 * loaded into the chain, read by nothing.
 *
 * The confusion underneath was between two different questions:
 *
 *   FIDELITY     is the render close to the reference?
 *   CONVERGENCE  have the passes stopped changing it?
 *
 * A small delta between pass N and N+1 means the process stopped moving. It
 * says nothing about whether it stopped on the right picture. Treating the
 * second as evidence for the first is how a stalled bad render was reported as
 * a finished good one.
 *
 * So the two axes are computed separately here and never fold into each other.
 *
 * ## Which metric is binding, and why that one
 *
 * `visual-diff-stats.json` carries five numbers. They are not
 * interchangeable, and only one of them is a gate:
 *
 *   classification  IDENTICAL / MINOR / MAJOR / CRITICAL, from
 *                   `classifyPercent` in tools/visual-diff/src/classify.ts:
 *                   0 -> IDENTICAL, <0.5 -> MINOR, <5 -> MAJOR, >=5 -> CRITICAL.
 *                   Its own docstring says it plainly: "The classification is
 *                   the gate; the score is a signal." The labels are canonical
 *                   in docs/visual-accuracy-contract.md. BINDING.
 *
 *   parityScore     round(100 - percent * 4), clamped to [0, 100]. Explicitly a
 *                   signal, not a gate — it is a rescaling of `percent` with no
 *                   independent meaning, and 43 is not a threshold anyone
 *                   validated. NOT binding.
 *
 *   percent         mismatchPx / totalPx * 100. The input `classification` is
 *                   computed FROM. Binding it separately would be the same
 *                   threshold twice, with a second chance to pick a different
 *                   one. NOT binding.
 *
 *   perceptual.ssim structural similarity over a blurred downsample, with its
 *                   own classification. It answers a different question and is
 *                   the more sensitive of the two to font rasterisation. Useful
 *                   diagnosis, and a second gate would need its own validation
 *                   run before it could refuse a render. NOT binding, reported.
 *
 *   moved           the convergence delta: how far this pass shifted `percent`
 *                   from the previous one. This is the CONVERGENCE axis and by
 *                   construction says nothing about fidelity. NOT binding on
 *                   fidelity.
 *
 * We deliberately do NOT invent a similarity threshold (">= 95%"). The
 * classification already carries a validated meaning; a fresh number would be a
 * threshold nobody measured, which is the same mistake in the other direction.
 * And we do not re-derive the classification from `percent` here: the
 * deterministic tool writes it, this module consumes it, and a stats file
 * without one is UNMEASURED rather than guessed.
 *
 * ## The direction of the veto
 *
 * Fidelity may only ever LOWER a claimed verdict, never raise one. A review
 * that asked for another pass is not overruled into readiness because the
 * pixels look acceptable — the review may have seen something the diff cannot,
 * and "the model may diagnose, the measurement may refuse" only works if the
 * measurement is not also allowed to approve.
 */

/** Is the render close to the reference? Independent of how it got there. */
export const FIDELITY = Object.freeze({
  PASS: "PASS",
  NEEDS_WORK: "NEEDS_WORK",
  CRITICAL: "CRITICAL",
  UNMEASURED: "UNMEASURED",
});

/**
 * Have the passes stopped changing the page? Independent of whether the page
 * is right. What the brief calls "converged" is STALLED here: movement has
 * stopped, and whether that is success or a stall is fidelity's answer, not
 * this axis's. Calling a stalled wrong render "converged" was the bug.
 */
export const CONVERGENCE = Object.freeze({
  IMPROVING: "IMPROVING",
  STALLED: "STALLED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Map the deterministic classification onto the fidelity axis.
 *
 * IDENTICAL and MINOR are PASS: MINOR is under half a percent of the page,
 * which is the band font rasterisation alone occupies between a vector PDF and
 * a design raster. MAJOR is NEEDS_WORK — "significant visual difference visible
 * immediately" per the accuracy contract. CRITICAL is CRITICAL.
 *
 * A stats file with no classification is UNMEASURED, not PASS: an absent
 * measurement is the one thing that must never read as a good one.
 *
 * @param {object|null} stats parsed visual-diff-stats.json, or null
 * @returns {{ level: string, classification: string|null, percent: number|null,
 *             parityScore: number|null, ssim: number|null }}
 */
export function fidelityOf(stats) {
  const none = {
    level: FIDELITY.UNMEASURED,
    classification: null,
    percent: null,
    parityScore: null,
    ssim: null,
  };
  if (!stats || typeof stats !== "object") return none;

  const classification = typeof stats.classification === "string" ? stats.classification : null;
  const read = {
    classification,
    percent: Number.isFinite(stats.percent) ? stats.percent : null,
    parityScore: Number.isFinite(stats.parityScore) ? stats.parityScore : null,
    ssim: Number.isFinite(stats.perceptual?.ssim) ? stats.perceptual.ssim : null,
  };

  switch (classification) {
    case "IDENTICAL":
    case "MINOR":
      return { level: FIDELITY.PASS, ...read };
    case "MAJOR":
      return { level: FIDELITY.NEEDS_WORK, ...read };
    case "CRITICAL":
      return { level: FIDELITY.CRITICAL, ...read };
    default:
      // Includes ACCEPTED_LIMITATION and INTENTIONAL_DIFFERENCE, which the
      // comparator never writes on its own — those are review labels and
      // require a human note, so seeing one here means the file was authored
      // rather than measured. Not a measurement, so not a pass.
      return { ...none, ...read };
  }
}

/**
 * Map the movement evidence onto the convergence axis.
 *
 * Consumes {@link diminishingReturns} and the latest revision's render sweep
 * rather than recomputing either, so the material-move threshold stays declared
 * in one place.
 *
 * Both are read because a pass is a *render*, not a folder. `diminishingReturns`
 * measures across revisions; a loop that re-renders one revision six times
 * without opening a new one produces no chain-level deltas at all, and the run
 * this guard was written for did exactly that — six renders, 14.00% to 14.17%,
 * chain-level movement UNKNOWN. Reporting that as "we cannot tell" while the
 * sweep line above it said the passes had stopped buying anything would be the
 * same conflation in a smaller place.
 *
 * @param {{measurable:boolean, stalled:boolean}|null} stalling across revisions
 * @param {{renders:number, stalled:boolean, trail:number[]}|null} sweep within the latest one
 * @returns {{ level: string, materialPercent: number|null, moves: Array, source: string|null }}
 */
export function convergenceOf(stalling, sweep = null) {
  const chainMeasurable = Boolean(stalling?.measurable);
  // Two renders give one delta; the stall test wants two, so three renders is
  // the point a sweep can say anything. Below that it is not evidence.
  const sweepMeasurable = Boolean(sweep && sweep.renders >= 3);

  if (!chainMeasurable && !sweepMeasurable) {
    return { level: CONVERGENCE.UNKNOWN, materialPercent: null, moves: [], source: null };
  }

  const chainStalled = chainMeasurable && stalling.stalled;
  const sweepStalled = sweepMeasurable && sweep.stalled;
  const materialPercent = stalling?.materialPercent ?? null;

  if (chainStalled || sweepStalled) {
    return {
      level: CONVERGENCE.STALLED,
      materialPercent,
      moves: stalling?.moves ?? [],
      source: chainStalled ? "revisions" : "sweep",
    };
  }
  return {
    level: CONVERGENCE.IMPROVING,
    materialPercent,
    moves: stalling?.moves ?? [],
    source: chainMeasurable ? "revisions" : "sweep",
  };
}

/**
 * May a claimed READY_FOR_APPROVAL stand, given what was measured?
 *
 * Returns the verdict to hold and, when it changed, the sentence explaining
 * why. Only ever downgrades: see the module docstring.
 *
 * The matrix, for a claimed READY:
 *
 *   CRITICAL   + any        -> REVISE   the hard rule; never ready, at any budget
 *   NEEDS_WORK + IMPROVING  -> REVISE   still moving, so keep going
 *   NEEDS_WORK + STALLED    -> REVISE   stalled short of parity; the bounds
 *                                       below this call turn a spent budget
 *                                       into CONVERGENCE_LIMIT_REACHED, which
 *                                       is the "needs intervention" state
 *   NEEDS_WORK + UNKNOWN    -> REVISE   one measurement, and it says MAJOR
 *   PASS       + any        -> stands
 *   UNMEASURED + any        -> stands here; the unmeasured-render guard in
 *                              iteration-status already refuses it, and
 *                              duplicating that would report it twice
 *
 * @param {{claimed:string, fidelity:object, convergence:object}} input
 * @returns {{ verdict: string, reason: string|null }}
 */
export function reconcileVerdict({ claimed, fidelity, convergence }) {
  if (claimed !== "READY_FOR_APPROVAL") return { verdict: claimed, reason: null };

  const measured =
    `${fidelity.classification} at ${fidelity.percent?.toFixed(3)}% of the page` +
    (fidelity.parityScore !== null ? `, parityScore ${fidelity.parityScore}` : "") +
    (fidelity.ssim !== null ? `, ssim ${fidelity.ssim}` : "");

  if (fidelity.level === FIDELITY.CRITICAL) {
    return {
      verdict: "REVISE",
      reason:
        `the comparator measured ${measured}. A CRITICAL classification is never ` +
        "READY_FOR_APPROVAL, whatever the review concluded: the review may diagnose the " +
        "difference, it may not decide the page is close enough",
    };
  }

  if (fidelity.level === FIDELITY.NEEDS_WORK) {
    const stalled = convergence.level === CONVERGENCE.STALLED;
    return {
      verdict: "REVISE",
      reason:
        `the comparator measured ${measured}. MAJOR is a significant visual difference, ` +
        (stalled
          ? `and the last passes moved it by less than ${convergence.materialPercent}% — the loop ` +
            "has stopped changing the page without reaching it, which is a stall, not a finish"
          : "and the loop is still moving; readiness is a claim about parity, not about effort"),
    };
  }

  return { verdict: claimed, reason: null };
}
