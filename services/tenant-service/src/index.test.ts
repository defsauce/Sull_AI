import { describe, expect, it } from 'vitest';
import { toTenantResponse, type TenantRecord } from './service.js';

describe('toTenantResponse', () => {
  it('serializes dates to ISO strings', () => {
    const tenant: TenantRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Acme',
      slug: 'acme',
      plan: 'enterprise',
      status: 'active',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
    };
    expect(toTenantResponse(tenant).createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
