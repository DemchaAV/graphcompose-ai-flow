import { describe, expect, it } from 'vitest';

import { classifyPercent, parityScore } from '../src/classify.js';

describe('classifyPercent', () => {
  it('maps exact zero to IDENTICAL', () => {
    expect(classifyPercent(0)).toBe('IDENTICAL');
  });

  it('maps just above zero to MINOR', () => {
    expect(classifyPercent(0.0001)).toBe('MINOR');
    expect(classifyPercent(0.1)).toBe('MINOR');
    expect(classifyPercent(0.4999)).toBe('MINOR');
  });

  it('treats the 0.5% boundary as MAJOR', () => {
    expect(classifyPercent(0.5)).toBe('MAJOR');
    expect(classifyPercent(1)).toBe('MAJOR');
    expect(classifyPercent(2)).toBe('MAJOR');
    expect(classifyPercent(4.9999)).toBe('MAJOR');
  });

  it('treats the 5% boundary as CRITICAL', () => {
    expect(classifyPercent(5)).toBe('CRITICAL');
    expect(classifyPercent(50)).toBe('CRITICAL');
    expect(classifyPercent(99.9)).toBe('CRITICAL');
  });

  it('rejects invalid inputs', () => {
    expect(() => classifyPercent(-1)).toThrow();
    expect(() => classifyPercent(Number.NaN)).toThrow();
    expect(() => classifyPercent(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('is pure (returns the same label across calls)', () => {
    const a = classifyPercent(0.25);
    const b = classifyPercent(0.25);
    expect(a).toBe(b);
  });
});

describe('parityScore', () => {
  it('returns 100 for zero diff', () => {
    expect(parityScore(0)).toBe(100);
  });

  it('returns 0 when diff is 25% or more', () => {
    expect(parityScore(25)).toBe(0);
    expect(parityScore(50)).toBe(0);
    expect(parityScore(99.9)).toBe(0);
    expect(parityScore(100)).toBe(0);
  });

  it('uses round(100 - percent * 4) inside the band', () => {
    expect(parityScore(1)).toBe(96);
    expect(parityScore(2)).toBe(92);
    expect(parityScore(5)).toBe(80);
    expect(parityScore(12.5)).toBe(50);
  });

  it('always returns a value in [0, 100]', () => {
    for (const p of [0, 0.0001, 0.5, 2, 5, 10, 24.9999, 25, 50, 99.9]) {
      const score = parityScore(p);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it('rejects invalid inputs', () => {
    expect(() => parityScore(-0.1)).toThrow();
    expect(() => parityScore(Number.NaN)).toThrow();
    expect(() => parityScore(Number.NEGATIVE_INFINITY)).toThrow();
  });
});
