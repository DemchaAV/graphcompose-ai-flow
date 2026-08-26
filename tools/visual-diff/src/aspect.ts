/**
 * Is the reference the same SHAPE as the render?
 *
 * `--scale-reference` resamples the reference to the render's exact width and
 * height. When the two differ only in dpi that is exactly right, and it is the
 * reason the option exists. When they differ in proportion it is a distortion:
 * a reference 5% shorter than the render is stretched to fit immediately before
 * the pixels are compared, the diff then reports a small mismatch, and the page
 * whose every vertical position is wrong passes the gate.
 *
 * Three projects shipped that way — `mocha-profile-cv` at 9.5% out,
 * `cv-reference` at 4.9%, `navy-executive-cv` at 4.2%. The page size is now
 * settled at import (scripts/lib/page-geometry.mjs); this is the backstop for
 * everything that reaches the diff anyway, and its job is to make sure the
 * distortion is stated rather than silently performed.
 *
 * No I/O, so it can be exhaustively unit-tested — the same reason classify.ts
 * is its own module.
 */

export interface AspectMismatch {
  /** height/width of the reference as it was loaded, before any scaling. */
  referenceAspect: number;
  /** height/width of the render. */
  outputAspect: number;
  /** How far apart they are, in percent of the render's aspect. */
  deviationPercent: number;
  /** The tolerance that was applied. */
  tolerancePercent: number;
}

/**
 * How far the proportions may differ before scaling one onto the other stops
 * being a resampling and starts being a distortion.
 *
 * The same number, and the same reasoning, as ASPECT_TOLERANCE_PERCENT in
 * scripts/lib/page-geometry.mjs, where the page size is decided;
 * scripts/test/contracts.test.mjs asserts the two never drift apart. It lives
 * twice because this package builds and ships on its own and importing a
 * harness script into it would be the wrong dependency — not because the two
 * are allowed to disagree.
 */
export const ASPECT_TOLERANCE_PERCENT = 1.0;

interface Dimensions {
  width: number;
  height: number;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Compare two shapes, ignoring size.
 *
 * Returns undefined when they agree within tolerance. An absent result says
 * "nothing was distorted", which is the common case and should not cost a field
 * in every stats file ever written.
 */
export function aspectMismatchOf(
  reference: Dimensions,
  output: Dimensions,
  tolerancePercent: number = ASPECT_TOLERANCE_PERCENT,
): AspectMismatch | undefined {
  if (reference.width <= 0 || output.width <= 0) {
    throw new Error(
      `cannot compare aspects of ${reference.width}x${reference.height} and ` +
        `${output.width}x${output.height}`,
    );
  }
  const referenceAspect = reference.height / reference.width;
  const outputAspect = output.height / output.width;
  const deviationPercent =
    (Math.abs(referenceAspect - outputAspect) / outputAspect) * 100;
  if (deviationPercent <= tolerancePercent) return undefined;
  return {
    referenceAspect: round(referenceAspect, 5),
    outputAspect: round(outputAspect, 5),
    deviationPercent: round(deviationPercent, 2),
    tolerancePercent,
  };
}

/** The warning a person reads, kept beside the rule that produces it. */
export function formatAspectWarning(mismatch: AspectMismatch): string {
  return (
    '[visual-diff] WARNING: the reference and the render are not the same shape. ' +
    `Reference aspect ${mismatch.referenceAspect}, render ${mismatch.outputAspect} ` +
    `(${mismatch.deviationPercent}% apart). --scale-reference stretched one onto the other, ` +
    'so the mismatch above was measured on a distorted reference and understates the real ' +
    'difference. That is a wrong page size, not a wrong layout: settle it with ' +
    'scripts/import-reference.mjs before reading anything else here.\n'
  );
}
