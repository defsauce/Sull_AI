import { describe, expect, it } from 'vitest';
import { toAuditResponse, type AuditRecord } from './service.js';

describe('toAuditResponse', () => {
  it('serializes audit metadata and timestamps', () => {
    const record: AuditRecord = {
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: '33333333-3333-4333-8333-333333333333',
      actor_id: 'user-123',
      actor_type: 'user',
      action: 'tenant.read',
      resource_type: 'tenant',
      resource_id: '33333333-3333-4333-8333-333333333333',
      outcome: 'success',
      metadata: { ip: '127.0.0.1' },
      recorded_at: new Date('2026-02-01T12:00:00.000Z'),
    };

    expect(toAuditResponse(record)).toMatchObject({
      actorId: 'user-123',
      action: 'tenant.read',
      outcome: 'success',
      recordedAt: '2026-02-01T12:00:00.000Z',
      metadata: { ip: '127.0.0.1' },
    });
  });
});
