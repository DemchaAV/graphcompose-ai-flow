/**
 * Pure functions that map a mismatch percentage to a parity score and
 * a classification label.
 *
 * The functions in this module perform no I/O. They are deliberately
 * small so they can be exhaustively unit-tested.
 *
 * The canonical labels live in docs/visual-accuracy-contract.md. We
 * never auto-apply ACCEPTED_LIMITATION or INTENTIONAL_DIFFERENCE here:
 * those labels require a human note.
 */

export type Classification =
  | 'IDENTICAL'
  | 'MINOR'
  | 'MAJOR'
  | 'CRITICAL';

/**
 * Map a mismatch percentage (0..100) to a classification label.
 *
 * Thresholds:
 *   percent === 0   -> IDENTICAL
 *   percent < 0.5   -> MINOR
 *   percent < 5     -> MAJOR
 *   percent >= 5    -> CRITICAL
 */
export function classifyPercent(percent: number): Classification {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error(
      `classifyPercent: expected a finite, non-negative number, got ${percent}`,
    );
  }
  if (percent === 0) {
    return 'IDENTICAL';
  }
  if (percent < 0.5) {
    return 'MINOR';
  }
  if (percent < 5) {
    return 'MAJOR';
  }
  return 'CRITICAL';
}

/**
 * Map a mismatch percentage to a strict parity score in [0, 100].
 *
 * Formula: round(100 - percent * 4), clamped to [0, 100].
 *
 * That means:
 *   0%   diff -> 100
 *   1%   diff -> 96
 *   5%   diff -> 80
 *   25%  diff -> 0
 *   100% diff -> 0 (clamped)
 *
 * The score is intentionally strict so even small visible diffs are
 * visible in the score without falling off a cliff. The classification
 * is the gate; the score is a signal.
 */
export function parityScore(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error(
      `parityScore: expected a finite, non-negative number, got ${percent}`,
    );
  }
  const raw = 100 - percent * 4;
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round(clamped);
}
