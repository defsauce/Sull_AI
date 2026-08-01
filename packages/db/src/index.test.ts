import { describe, expect, it } from 'vitest';
import { OUTBOX_DDL, IDEMPOTENCY_DDL } from './index.js';

describe('@sull/db', () => {
  it('exposes outbox and idempotency DDL', () => {
    expect(OUTBOX_DDL).toContain('outbox_events');
    expect(IDEMPOTENCY_DDL).toContain('idempotency_keys');
  });
});
