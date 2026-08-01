import { describe, expect, it } from 'vitest';
import { calculateUsageAmount } from './service.js';

describe('calculateUsageAmount', () => {
  it('computes pro plan token usage cost', () => {
    expect(calculateUsageAmount('tokens', 1_000_000, 'pro')).toBeCloseTo(2, 5);
  });

  it('returns zero for free plan meters', () => {
    expect(calculateUsageAmount('requests', 500, 'free')).toBe(0);
  });
});
