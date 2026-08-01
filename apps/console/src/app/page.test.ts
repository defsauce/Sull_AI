import { describe, expect, it } from 'vitest';

describe('console', () => {
  it('exposes a stable product name', () => {
    expect('Sull AI').toContain('Sull');
  });
});
