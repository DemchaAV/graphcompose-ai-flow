/**
 * scripts/lib/typography-match.mjs — which family is that, and what size?
 *
 * The two questions a reviewer currently answers by eye and then by trial. "It
 * looks like a serif, try PT Serif" is a revision; being wrong is another one;
 * and "the size is a bit small, try 10.5" is a third. Each costs a full render
 * and a full comparison, and the loop has a budget of eight.
 *
 * Both are decidable by measurement instead. The same string set in two
 * families differs in two independent ways, and this scores both:
 *
 * - **how wide it runs** — `Handgloves 0123` at one size is 385px in Barlow
 *   Condensed and 607px in JetBrains Mono, normalised to the same height. That
 *   spread is large, stable, and survives any resolution the reference was
 *   captured at.
 * - **the letterforms themselves** — stretch both to an identical box, which
 *   removes the width signal entirely, and compare what is left.
 *
 * They are reported separately as well as combined, because when they disagree
 * that disagreement is information: matching shapes with mismatched width is a
 * condensed or extended cut of the same face, and matching width with
 * mismatched shapes is a different face that happens to set at the same measure.
 *
 * ## Why the images are blurred before they are compared
 *
 * Compared sharp, two different families score about as badly as two *unrelated*
 * families: black-on-white text misaligned by a stroke width is essentially
 * uncorrelated, so every wrong answer saturates near the same number and the
 * ranking below first place is noise. Measured on the six-family specimen,
 * sharp RMSE spread across the wrong answers was 0.44–0.47 — a 1.08x range.
 * Blurred, the same comparison spreads 0.084–0.121, a 1.4x range, because near
 * misses stop being penalised as heavily as far ones.
 *
 * ## What this does not claim
 *
 * The weights are **not calibrated against a corpus**, because no corpus of
 * reference crops with known answers exists. Two penalties that are zero for a
 * perfect match are added, and that is the whole of it. Rank 1 against a crop of
 * a known family is verified; the ordering further down is evidence, not a
 * measurement, and the scores are reported so a reader can see how close the
 * race was rather than trusting the order.
 *
 * No model is called from any path in this file.
 */

/** Height every crop is normalised to before its ink is measured, in pixels. */
export const NORMAL_HEIGHT = 64;

/** The fixed box both crops are stretched into for the shape comparison. */
export const SHAPE_BOX = { width: 256, height: 64 };

/**
 * Gaussian sigma applied before the shape comparison. See the header — without
 * it, every wrong family scores the same and the ranking carries no information
 * past first place.
 */
export const SHAPE_BLUR = 4;

/**
 * The smallest difference in a size search worth acting on, in points.
 *
 * Below this, two candidates are the same answer: no reviewer sets type to a
 * fiftieth of a point, and the difference is inside what the ink measurement
 * itself varies by between renders.
 */
export const MEANINGFUL_POINTS = 0.1;

/** Tolerance for the trim that finds the ink, as a percentage. */
export const TRIM_FUZZ_PERCENT = 12;

/**
 * A node's box in the rendered PNG's pixels.
 *
 * The snapshot is in points with y growing upward from the page bottom; the
 * image is in pixels with y growing downward from the top. Both conversions
 * happen here so no caller has to remember either.
 */
export function nodeToPixelRect(node, canvas, dpi) {
  const scale = dpi / 72;
  const top = node.placementY + node.placementHeight;
  return {
    x: Math.round(node.placementX * scale),
    y: Math.round((canvas.pageHeight - top) * scale),
    width: Math.round(node.placementWidth * scale),
    height: Math.round(node.placementHeight * scale),
  };
}

/**
 * Expand the candidate space.
 *
 * A `size` sweep and a `family` sweep are the same operation with a different
 * axis, which is why `typography match` and `typography search` share
 * everything below this line: one varies family at a fixed size, the other
 * varies size at a fixed family.
 */
export function expandCandidates({ families = [], sizes = [] } = {}) {
  if (families.length === 0) throw new TypeError("no families to try");
  if (sizes.length === 0) throw new TypeError("no sizes to try");
  const out = [];
  for (const family of families) {
    for (const size of sizes) {
      out.push({ id: `Candidate_${out.length}`, family, size: Number(size) });
    }
  }
  return out;
}

/**
 * An inclusive numeric range, for the size search.
 *
 * Steps are rebuilt from the start each time rather than accumulated, because
 * adding 0.1 forty times lands on 10.500000000000004 and the label a reviewer
 * is handed should be the number they would type.
 */
export function numericRange(from, to, step) {
  if (!(step > 0)) throw new TypeError("step must be positive");
  if (to < from) throw new TypeError("the range ends before it starts");
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  const count = Math.floor((to - from) / step + 1e-9);
  const values = [];
  for (let i = 0; i <= count; i += 1) values.push(Number((from + i * step).toFixed(decimals)));
  return values;
}

const ratio = (box) => (box.height > 0 ? box.width / box.height : 0);

/**
 * Score one candidate against the reference.
 *
 * Both penalties are zero for a perfect match and grow with difference; they
 * are summed. `aspect` uses a log ratio so that "10% wider" and "10% narrower"
 * are penalised equally — a linear difference is not symmetric and would prefer
 * narrow faces.
 */
export function scoreCandidate({ referenceInk, candidateInk, shapeRmse }) {
  const referenceRatio = ratio(referenceInk);
  const candidateRatio = ratio(candidateInk);
  const aspect =
    referenceRatio > 0 && candidateRatio > 0 ? Math.abs(Math.log(candidateRatio / referenceRatio)) : Number.POSITIVE_INFINITY;
  const shape = Number.isFinite(shapeRmse) ? shapeRmse : Number.POSITIVE_INFINITY;
  return {
    aspectPenalty: round(aspect),
    shapePenalty: round(shape),
    score: round(aspect + shape),
    widthRatio: referenceRatio > 0 ? round(candidateRatio / referenceRatio) : null,
  };
}

const round = (n) => (Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null);

/**
 * Rank scored candidates, best first.
 *
 * `separation` is the gap to the runner-up, and it is the number that says
 * whether to believe the answer. A first place 0.001 ahead of second is a
 * coin toss reported as a result, and a caller that only reads `[0]` would
 * never know.
 */
export function rank(scored) {
  const ordered = [...scored].sort((a, b) => {
    if (a.score !== b.score) return (a.score ?? Infinity) - (b.score ?? Infinity);
    return String(a.family ?? "").localeCompare(String(b.family ?? ""));
  });
  return ordered.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    separation: index === 0 && ordered.length > 1 ? round(ordered[1].score - ordered[0].score) : null,
  }));
}

/**
 * How far a candidate's ink is from the reference's, in points.
 *
 * A **different measurement from `scoreCandidate`**, and the distinction cost a
 * wrong answer before it was noticed. Family matching deliberately normalises
 * scale away, because the reference crop's resolution is unknown and a face has
 * to be recognisable at any size. Run a size sweep through that same metric and
 * every size scores identically — the first attempt reported "best 28, a clear
 * minimum" for a crop that was 24pt, off nothing but rendering noise.
 *
 * Size is only answerable when the reference's scale is known, so it is
 * measured in points on both sides and subtracted. If a caller cannot say how
 * many pixels of their reference make a point, the question has no answer and
 * `typography search` refuses rather than producing one.
 */
export function scoreSize({ referenceInkPt, candidateInkPt }) {
  const delta = Math.abs(candidateInkPt - referenceInkPt);
  return { deltaPt: round(delta), candidateInkPt: round(candidateInkPt), score: round(delta) };
}

/**
 * The size the reference's ink implies, by proportion.
 *
 * Type scales linearly, so one measured candidate answers the question outright
 * and the sweep is a check rather than a search. Reported beside the sweep's
 * winner: when the two disagree the sweep's step is too coarse, and that is
 * worth seeing rather than averaging away.
 */
export function impliedSize({ referenceInkPt, candidateInkPt, candidateSize }) {
  if (!(candidateInkPt > 0) || !(candidateSize > 0)) return null;
  return round((referenceInkPt / candidateInkPt) * candidateSize);
}

/**
 * The deterministic answer to "what size is this?".
 *
 * Returns the best value **and the whole curve**, because the shape of the
 * curve is what says whether the answer means anything: a clear minimum is an
 * answer, and a flat run of near-equal scores means the metric cannot tell 10.4
 * from 10.6 and nobody should re-render four times pretending otherwise.
 */
export function searchCurve(scored) {
  const curve = [...scored].sort((a, b) => a.size - b.size).map((e) => ({ size: e.size, score: e.score }));
  const ranked = rank(scored);
  const best = ranked[0] ?? null;
  const scores = curve.map((p) => p.score).filter((s) => Number.isFinite(s));
  const spread = scores.length ? round(Math.max(...scores) - Math.min(...scores)) : null;

  // Every size the measurement cannot tell apart from the winner. The threshold
  // is ABSOLUTE, in points, and that matters: a threshold relative to the
  // curve's own spread calls any monotone curve decisive, however small its
  // differences are. Four sizes scoring 0.300, 0.301, 0.302, 0.303 do have a
  // minimum, and reporting it would send the loop re-rendering after three
  // thousandths of a point.
  const indistinguishable = best ? curve.filter((p) => p.score - best.score < MEANINGFUL_POINTS).map((p) => p.size) : [];

  return {
    best: best ? { size: best.size, score: best.score, separation: best.separation } : null,
    curve,
    spread,
    decisive: Boolean(best && best.separation != null && best.separation >= MEANINGFUL_POINTS),
    indistinguishable,
  };
}
