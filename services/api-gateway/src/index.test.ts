import { describe, expect, it } from 'vitest';
import { resolveUpstream } from './proxy.js';

describe('resolveUpstream', () => {
  const env = {
    IDENTITY_SERVICE_URL: 'http://identity:8080',
    TENANT_SERVICE_URL: 'http://tenant:8080',
    AGENT_ORCHESTRATOR_URL: 'http://agents:8080',
  };

  it('routes auth to identity', () => {
    expect(resolveUpstream('/v1/auth/login', env)).toBe(env.IDENTITY_SERVICE_URL);
  });

  it('routes tenants to tenant-service', () => {
    expect(resolveUpstream('/v1/tenants', env)).toBe(env.TENANT_SERVICE_URL);
  });

  it('routes agent-runs to agent-orchestrator', () => {
    expect(resolveUpstream('/v1/agent-runs', env)).toBe(env.AGENT_ORCHESTRATOR_URL);
  });
});
