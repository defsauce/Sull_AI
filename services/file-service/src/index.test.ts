import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from './service.js';

describe('sanitizeFilename', () => {
  it('replaces unsafe characters and truncates long names', () => {
    const input = '../../etc/passwd' + 'x'.repeat(300);
    const sanitized = sanitizeFilename(input);
    expect(sanitized).not.toContain('/');
    expect(sanitized.length).toBeLessThanOrEqual(255);
  });
});
