import { describe, expect, it } from 'vitest';
import { tenantCreateSchema } from './index.js';

describe('@sull/contracts', () => {
  it('validates tenant create payloads', () => {
    const parsed = tenantCreateSchema.parse({
      name: 'Acme',
      slug: 'acme',
      plan: 'enterprise',
    });
    expect(parsed.slug).toBe('acme');
  });
});
