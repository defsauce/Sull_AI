import { describe, expect, it } from 'vitest';
import { matchesCondition, matchesPattern } from './service.js';

describe('policy matching', () => {
  it('matches wildcard action patterns', () => {
    expect(matchesPattern('files.*', 'files.read')).toBe(true);
    expect(matchesPattern('files.*', 'billing.read')).toBe(false);
  });

  it('requires all condition keys to match context values', () => {
    expect(matchesCondition({ role: 'admin' }, { role: 'admin', tenant: 'a' })).toBe(true);
    expect(matchesCondition({ role: 'admin' }, { role: 'member' })).toBe(false);
  });
});
