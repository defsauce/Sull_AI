import { describe, expect, it } from 'vitest';
import { isWebhookDestination } from './service.js';

describe('isWebhookDestination', () => {
  it('accepts https webhook URLs', () => {
    expect(isWebhookDestination('https://hooks.example.com/notify')).toBe(true);
  });

  it('rejects non-URL destinations', () => {
    expect(isWebhookDestination('not-a-url')).toBe(false);
  });
});
