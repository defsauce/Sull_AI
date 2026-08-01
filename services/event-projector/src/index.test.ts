import { describe, expect, it } from 'vitest';
import { EventTypes } from '@sull/events';
import { shouldProjectEvent } from './service.js';

describe('shouldProjectEvent', () => {
  it('includes tenant, user, and billing usage events', () => {
    expect(shouldProjectEvent(EventTypes.TenantCreated)).toBe(true);
    expect(shouldProjectEvent(EventTypes.UserRegistered)).toBe(true);
    expect(shouldProjectEvent(EventTypes.UsageRecorded)).toBe(true);
  });

  it('skips unrelated event types', () => {
    expect(shouldProjectEvent(EventTypes.FileUploaded)).toBe(false);
  });
});
