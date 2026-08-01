import { describe, expect, it } from 'vitest';
import { assertTenantAccess, requireScopes, type Principal } from '@sull/auth-sdk';
import { SullError } from '@sull/errors';

const principal: Principal = {
  sub: 'user-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  roles: ['member'],
  scopes: ['tenants:read'],
  typ: 'user',
};

describe('zero-trust authz guards', () => {
  it('blocks missing scopes', () => {
    expect(() => requireScopes(principal, ['tenants:write'])).toThrow(SullError);
  });

  it('blocks cross-tenant access', () => {
    expect(() =>
      assertTenantAccess(principal, '22222222-2222-4222-8222-222222222222'),
    ).toThrow(SullError);
  });

  it('allows same-tenant access with required scope', () => {
    expect(() => requireScopes(principal, ['tenants:read'])).not.toThrow();
    expect(() => assertTenantAccess(principal, principal.tenantId)).not.toThrow();
  });
});
