import { describe, expect, it } from 'vitest';
import { hashTokenForTest } from './test-helpers.js';

describe('identity token hashing', () => {
  it('produces stable sha256 digests', () => {
    expect(hashTokenForTest('abc')).toBe(hashTokenForTest('abc'));
    expect(hashTokenForTest('abc')).not.toBe(hashTokenForTest('abcd'));
    expect(hashTokenForTest('abc')).toHaveLength(64);
  });
});
