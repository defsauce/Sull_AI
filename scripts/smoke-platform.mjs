#!/usr/bin/env node
/**
 * Smoke test against a running local stack (api-gateway + identity).
 * Soft-exits 0 when the stack is down so CI without Docker remains green.
 */
const gateway = process.env.API_GATEWAY_URL ?? 'http://127.0.0.1:8080';
const email = `smoke.${Date.now()}@example.com`;
const password = 'correct-horse-battery';

async function main() {
  try {
    const health = await fetch(`${gateway}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) {
      console.log(JSON.stringify({ skipped: true, reason: 'gateway unhealthy' }));
      return;
    }
  } catch {
    console.log(JSON.stringify({ skipped: true, reason: 'gateway unreachable' }));
    return;
  }

  const register = await fetch(`${gateway}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      displayName: 'Smoke User',
      password,
    }),
  });
  if (register.status !== 201 && register.status !== 409) {
    throw new Error(`register failed: ${register.status} ${await register.text()}`);
  }

  const login = await fetch(`${gateway}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`login failed: ${login.status} ${await login.text()}`);
  }
  const tokens = await login.json();

  const tenant = await fetch(`${gateway}/v1/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${tokens.accessToken}`,
    },
    body: JSON.stringify({
      name: 'Smoke Tenant',
      slug: `smoke-${Date.now()}`,
      plan: 'pro',
    }),
  });
  if (tenant.status !== 201) {
    throw new Error(`tenant create failed: ${tenant.status} ${await tenant.text()}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      gateway,
      email,
      tenant: await tenant.json(),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
