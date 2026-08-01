import { describe, expect, it } from 'vitest';
import {
  EventTypes,
  createCloudEvent,
  parseCloudEvent,
  tenantCreatedDataSchema,
  topicFor,
} from './index.js';

describe('@sull/events', () => {
  it('creates and parses versioned cloud events', () => {
    const event = createCloudEvent({
      type: EventTypes.TenantCreated,
      source: 'tenant-service',
      tenantId: '11111111-1111-4111-8111-111111111111',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      aggregateType: 'tenant',
      sequence: 1,
      data: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        name: 'Acme Corp',
        slug: 'acme',
        plan: 'enterprise' as const,
        createdBy: '22222222-2222-4222-8222-222222222222',
      },
    });

    const parsed = parseCloudEvent(event, tenantCreatedDataSchema);
    expect(parsed.type).toBe(EventTypes.TenantCreated);
    expect(parsed.data.slug).toBe('acme');
    expect(topicFor('tenant')).toBe('sull.tenant.events.v1');
  });
});
