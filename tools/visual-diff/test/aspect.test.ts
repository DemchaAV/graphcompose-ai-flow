/**
 * The diff must say when it distorted the reference instead of resampling it.
 *
 * `--scale-reference` was written for the case where a screenshot and a render
 * differ only in dpi. It also, silently, handled the case where they differ in
 * PROPORTION — stretching a reference that was never the same shape onto the
 * render immediately before comparing pixels. Three projects on disk passed
 * their gates that way, at 4.2%, 4.9% and 9.5% out.
 *
 * These tests pin the two halves of the fix: within tolerance is silence, and
 * beyond it is a stated fact carried out with the stats.
 */

import { describe, expect, it } from 'vitest';

import {
  ASPECT_TOLERANCE_PERCENT,
  aspectMismatchOf,
  formatAspectWarning,
} from '../src/aspect.js';

describe('aspectMismatchOf', () => {
  it('says nothing when the two are the same shape at different sizes', () => {
    // The case the option exists for: a 150dpi screenshot against a 300dpi
    // render. Same page, twice the pixels, nothing distorted.
    expect(aspectMismatchOf({ width: 595, height: 842 }, { width: 1190, height: 1684 }))
      .toBeUndefined();
  });

  it('says nothing when they are identical', () => {
    expect(aspectMismatchOf({ width: 800, height: 600 }, { width: 800, height: 600 }))
      .toBeUndefined();
  });

  it('tolerates the pixel or two a screenshot loses to window chrome', () => {
    // 841 against 842 is 0.12% — below any scale at which a layout reads wrong.
    expect(aspectMismatchOf({ width: 595, height: 841 }, { width: 595, height: 842 }))
      .toBeUndefined();
  });

  it('reports a reference that is proportionally shorter than the render', () => {
    // mocha-profile-cv: a 589x754 reference against an A4 render.
    const mismatch = aspectMismatchOf({ width: 589, height: 754 }, { width: 1240, height: 1753 });
    expect(mismatch).toBeDefined();
    expect(mismatch!.referenceAspect).toBeCloseTo(1.28014, 4);
    expect(mismatch!.outputAspect).toBeCloseTo(1.41371, 4);
    expect(mismatch!.deviationPercent).toBeCloseTo(9.45, 1);
    expect(mismatch!.tolerancePercent).toBe(ASPECT_TOLERANCE_PERCENT);
  });

  it('reports a reference that is proportionally taller than the render', () => {
    const mismatch = aspectMismatchOf({ width: 500, height: 900 }, { width: 500, height: 700 });
    expect(mismatch).toBeDefined();
    expect(mismatch!.deviationPercent).toBeGreaterThan(ASPECT_TOLERANCE_PERCENT);
  });

  it('catches an orientation flip, which is the largest mismatch there is', () => {
    const mismatch = aspectMismatchOf({ width: 842, height: 595 }, { width: 595, height: 842 });
    expect(mismatch).toBeDefined();
    expect(mismatch!.deviationPercent).toBeGreaterThan(45);
  });

  it('takes a stricter tolerance when a caller asks for one', () => {
    const dims = [{ width: 595, height: 838 }, { width: 595, height: 842 }] as const;
    expect(aspectMismatchOf(dims[0], dims[1])).toBeUndefined();
    expect(aspectMismatchOf(dims[0], dims[1], 0.1)).toBeDefined();
  });

  it('refuses a zero-width image rather than dividing by it', () => {
    expect(() => aspectMismatchOf({ width: 0, height: 10 }, { width: 5, height: 5 }))
      .toThrow(/cannot compare aspects/);
  });
});

describe('formatAspectWarning', () => {
  it('carries the numbers and the next step, not just a complaint', () => {
    const mismatch = aspectMismatchOf(
      { width: 589, height: 754 },
      { width: 1240, height: 1753 },
    )!;
    const text = formatAspectWarning(mismatch);

    expect(text).toContain('WARNING');
    expect(text).toContain(String(mismatch.referenceAspect));
    expect(text).toContain(String(mismatch.outputAspect));
    // The warning has to route somewhere, or it is noise a reader learns to
    // scroll past. The page size is settled at import, so that is where it points.
    expect(text).toContain('import-reference.mjs');
    // And it has to say which way the error runs: a stretched reference makes
    // the reported mismatch smaller than the truth, not larger.
    expect(text).toContain('understates');
    expect(text.endsWith('\n')).toBe(true);
  });
});
