import { describe, expect, it } from 'vitest';
import { requireScopes, type Principal } from './index.js';
import { SullError } from '@sull/errors';

const principal: Principal = {
  sub: 'user-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  roles: ['admin'],
  scopes: ['tenants:read'],
  typ: 'user',
};

describe('requireScopes', () => {
  it('allows when scopes present', () => {
    expect(() => requireScopes(principal, ['tenants:read'])).not.toThrow();
  });

  it('denies when scopes missing', () => {
    expect(() => requireScopes(principal, ['tenants:write'])).toThrow(SullError);
  });
});
