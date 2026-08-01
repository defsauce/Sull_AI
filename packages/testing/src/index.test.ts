import { describe, expect, it } from 'vitest';
import { randomEmail } from './index.js';

describe('@sull/testing', () => {
  it('creates unique emails', () => {
    expect(randomEmail()).not.toBe(randomEmail());
  });
});
