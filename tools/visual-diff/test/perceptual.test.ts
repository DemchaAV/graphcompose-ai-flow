import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { classifyPerceptual, perceptualSimilarity, PERCEPTUAL_THRESHOLDS } from '../src/perceptual.js';

/** A white page with one dark block, optionally shifted, optionally with a speckle of AA noise. */
function page(width: number, height: number, block: { x: number; y: number; w: number; h: number } | null, noise = 0): PNG {
  const png = new PNG({ width, height });
  png.data.fill(255);
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const inside = block && x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h;
      let v = inside ? 30 : 255;
      if (noise > 0 && rand() < noise) v = Math.max(0, Math.min(255, v + (rand() < 0.5 ? -40 : 40)));
      png.data[i] = v;
      png.data[i + 1] = v;
      png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

describe('perceptualSimilarity', () => {
  it('scores identical images 1 and classifies them IDENTICAL', () => {
    const a = page(256, 256, { x: 40, y: 40, w: 120, h: 60 });
    const b = page(256, 256, { x: 40, y: 40, w: 120, h: 60 });
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBe(1);
    expect(r.classification).toBe('IDENTICAL');
    expect(r.downsample).toBe(4);
  });

  it('forgives edge noise the pixel count would not', () => {
    // 4% of pixels perturbed by ±40: a pixel diff calls this several percent
    // of the page; the perceptual score barely moves.
    const a = page(256, 256, { x: 40, y: 40, w: 120, h: 60 });
    const b = page(256, 256, { x: 40, y: 40, w: 120, h: 60 }, 0.04);
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBeGreaterThan(PERCEPTUAL_THRESHOLDS.minor);
    expect(r.classification).toBe('MINOR');
  });

  it('a block in a different place scores low, and the worst window is where it moved', () => {
    const a = page(256, 256, { x: 40, y: 40, w: 120, h: 60 });
    const b = page(256, 256, { x: 40, y: 150, w: 120, h: 60 });
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBeLessThan(PERCEPTUAL_THRESHOLDS.major);
    expect(r.classification).toBe('CRITICAL');
    expect(r.worstWindow).not.toBeNull();
    // The worst window sits inside one of the two block positions.
    const ww = r.worstWindow as { x: number; y: number };
    const inOld = ww.y >= 32 && ww.y < 104;
    const inNew = ww.y >= 144 && ww.y < 216;
    expect(inOld || inNew).toBe(true);
  });

  it('a missing block scores between a moved one and identity', () => {
    const a = page(256, 256, { x: 40, y: 40, w: 120, h: 60 });
    const b = page(256, 256, null);
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBeLessThan(0.95);
    expect(r.ssim).toBeGreaterThan(0.3);
  });

  it('an image too small for one window is UNMEASURED, not IDENTICAL', () => {
    const a = page(30, 30, { x: 2, y: 2, w: 10, h: 10 });
    const b = page(30, 30, null);
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBeNull();
    expect(r.classification).toBe('UNMEASURED');
  });

  it('the trailing strip of a page whose size is not a multiple of the window still counts', () => {
    // 260 wide: 8 windows of 32 cover 256, and the block at x 256..260 is only
    // seen by the edge-anchored window.
    const a = page(260, 128, null);
    const b = page(260, 128, { x: 244, y: 40, w: 16, h: 40 });
    const r = perceptualSimilarity(a, b);
    expect(r.ssim).toBeLessThan(1);
    expect(r.worstWindow).not.toBeNull();
  });

  it('refuses images of different sizes', () => {
    expect(() => perceptualSimilarity(page(64, 64, null), page(32, 64, null))).toThrow(/differ/);
  });

  it('the thresholds are what classifyPerceptual reads', () => {
    expect(classifyPerceptual(1)).toBe('IDENTICAL');
    expect(classifyPerceptual(PERCEPTUAL_THRESHOLDS.minor)).toBe('MINOR');
    expect(classifyPerceptual(PERCEPTUAL_THRESHOLDS.major)).toBe('MAJOR');
    expect(classifyPerceptual(0.5)).toBe('CRITICAL');
  });
});
