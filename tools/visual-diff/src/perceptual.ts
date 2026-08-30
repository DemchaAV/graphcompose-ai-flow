/**
 * A perceptual similarity beside the pixel count.
 *
 * ## Why
 *
 * The pixel count against a rasterised design reference is never zero and is
 * mostly glyph anti-aliasing: every one of fifty real revisions classified
 * CRITICAL on it (5.2%–12.5% of the page), including the ones approved as
 * finished, so the classification carried no information and every review
 * said so in prose. What a person sees when they call a render "close" is
 * structure — the same blocks in the same places at the same weight — which
 * the pixel count cannot separate from a different hinting of the same glyph.
 *
 * This computes that: both images to luminance, downsampled by block mean so
 * a glyph edge becomes a smear of the same grey on both sides, lightly
 * blurred, then the structural similarity (SSIM) over 8x8 windows, averaged.
 * Identical pages score 1; the same layout in a substituted typeface scores
 * high; a block in the wrong place or missing scores low.
 *
 * It is a second signal, not a replacement. The pixel diff still localises
 * (region-diff, the diff image); this says how far the page is, in the sense
 * a reader means. Thresholds are provisional and stated as such — see
 * `classifyPerceptual`.
 */

export interface PerceptualOptions {
  /** Block size for the downsample. Default 4: a 1240x1753 page becomes 310x438. */
  downsample?: number;
  /** Apply one 3x3 box blur after downsampling. Default true. */
  blur?: boolean;
  /** SSIM window edge, in downsampled pixels. Default 8. */
  window?: number;
}

export type PerceptualClassification = 'IDENTICAL' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'UNMEASURED';

export interface PerceptualResult {
  /**
   * Mean SSIM over the windows, in [0, 1] — or null when the image is too
   * small to hold one window after the downsample (under 32 source pixels on
   * a side at the defaults), in which case the classification is UNMEASURED.
   * A crop that cannot be measured must not read as IDENTICAL.
   */
  ssim: number | null;
  /** The worst window, so a page that is right everywhere but one block still says so. */
  worstWindow: { ssim: number; x: number; y: number; size: number } | null;
  downsample: number;
  blurred: boolean;
  window: number;
  classification: PerceptualClassification;
}

/**
 * Provisional thresholds, read off the audited corpus and named as such: a
 * run should quote the number, and a threshold nobody has measured against a
 * person's judgement should not end a loop.
 *
 * The distribution they were read off (50 revisions, reference-scaled vs
 * output, pixel mismatch 5–12% on every one): the invoices approved as
 * finished sit at 0.93–0.95; proposals with a substituted face and a wrong
 * card at 0.88–0.92; a poster built at a different aspect at 0.64; a one-page
 * render measured against page 1 of a two-page reference at 0.44–0.55. The
 * pixel count ordered none of that.
 */
export const PERCEPTUAL_THRESHOLDS = Object.freeze({
  identical: 0.999,
  minor: 0.93,
  major: 0.8,
});

export function classifyPerceptual(ssim: number): PerceptualClassification {
  if (ssim >= PERCEPTUAL_THRESHOLDS.identical) return 'IDENTICAL';
  if (ssim >= PERCEPTUAL_THRESHOLDS.minor) return 'MINOR';
  if (ssim >= PERCEPTUAL_THRESHOLDS.major) return 'MAJOR';
  return 'CRITICAL';
}

interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

/** RGBA → luminance, downsampled by block mean. */
export function toGray(
  rgba: Uint8Array | Buffer,
  width: number,
  height: number,
  factor: number,
): Gray {
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
  const out = new Float32Array(w * h);
  for (let by = 0; by < h; by += 1) {
    for (let bx = 0; bx < w; bx += 1) {
      let sum = 0;
      let n = 0;
      for (let y = by * factor; y < (by + 1) * factor && y < height; y += 1) {
        for (let x = bx * factor; x < (bx + 1) * factor && x < width; x += 1) {
          const i = (y * width + x) * 4;
          sum += 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
          n += 1;
        }
      }
      out[by * w + bx] = n > 0 ? sum / n : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** One 3x3 box blur, edges clamped. */
export function boxBlur(g: Gray): Gray {
  const { width, height, data } = g;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          sum += data[yy * width + xx] ?? 0;
          n += 1;
        }
      }
      out[y * width + x] = sum / n;
    }
  }
  return { width, height, data: out };
}

/**
 * Mean SSIM over non-overlapping windows, with the worst window named.
 *
 * The standard constants (K1 = 0.01, K2 = 0.03, L = 255).
 */
export function ssimWindows(a: Gray, b: Gray, window: number): { mean: number; worst: PerceptualResult['worstWindow'] } {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`ssim: images differ in size (${a.width}x${a.height} vs ${b.width}x${b.height})`);
  }
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let count = 0;
  let worst: PerceptualResult['worstWindow'] = null;
  // Window origins on the stride, plus one anchored at the far edge when the
  // dimension is not a multiple of the window — otherwise the trailing strip
  // (up to 28 source pixels at the defaults) never contributes to any score,
  // and a page's right margin and footer line are exactly there.
  const origins = (extent: number): number[] => {
    const out: number[] = [];
    for (let o = 0; o + window <= extent; o += window) out.push(o);
    if (extent >= window && (out.length === 0 || (out[out.length - 1] ?? 0) + window < extent)) out.push(extent - window);
    return out;
  };
  const ys = origins(a.height);
  const xs = origins(a.width);
  for (const wy of ys) {
    for (const wx of xs) {
      let ma = 0;
      let mb = 0;
      const n = window * window;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          const i = (wy + y) * a.width + (wx + x);
          ma += a.data[i] ?? 0;
          mb += b.data[i] ?? 0;
        }
      }
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let y = 0; y < window; y += 1) {
        for (let x = 0; x < window; x += 1) {
          const i = (wy + y) * a.width + (wx + x);
          const da = (a.data[i] ?? 0) - ma;
          const db = (b.data[i] ?? 0) - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= n - 1;
      vb /= n - 1;
      cov /= n - 1;
      const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      total += s;
      count += 1;
      if (!worst || s < worst.ssim) worst = { ssim: s, x: wx, y: wy, size: window };
    }
  }
  if (count === 0) return { mean: 1, worst: null };
  return { mean: total / count, worst };
}

/**
 * Compare two same-sized RGBA images perceptually.
 */
export function perceptualSimilarity(
  reference: { width: number; height: number; data: Uint8Array | Buffer },
  output: { width: number; height: number; data: Uint8Array | Buffer },
  options: PerceptualOptions = {},
): PerceptualResult {
  if (reference.width !== output.width || reference.height !== output.height) {
    throw new Error(
      `perceptual: image dimensions differ (${reference.width}x${reference.height} vs ${output.width}x${output.height})`,
    );
  }
  const downsample = Math.max(1, Math.floor(options.downsample ?? 4));
  const blur = options.blur ?? true;
  const window = Math.max(2, Math.floor(options.window ?? 8));

  let a = toGray(reference.data, reference.width, reference.height, downsample);
  let b = toGray(output.data, output.width, output.height, downsample);
  if (blur) {
    a = boxBlur(a);
    b = boxBlur(b);
  }
  const { mean, worst } = ssimWindows(a, b, window);
  if (worst === null) {
    // Not one window fits: under 32 source pixels on a side at the defaults.
    // Say so rather than reporting a perfect score for nothing measured.
    return { ssim: null, worstWindow: null, downsample, blurred: blur, window, classification: 'UNMEASURED' };
  }
  const ssim = Math.max(0, Math.min(1, mean));
  return {
    ssim: Math.round(ssim * 10000) / 10000,
    worstWindow: worst
      ? {
          ssim: Math.round(worst.ssim * 10000) / 10000,
          // Back in the full-resolution image's pixels.
          x: worst.x * downsample,
          y: worst.y * downsample,
          size: worst.size * downsample,
        }
      : null,
    downsample,
    blurred: blur,
    window,
    classification: classifyPerceptual(ssim),
  };
}
