const GATEWAY_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:8080';

export async function gatewayFetch(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.accessToken) {
    headers.set('authorization', `Bearer ${init.accessToken}`);
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'ok' | 'down' | 'unknown';
  latencyMs: number;
}

const HEALTH_TARGETS = [
  { name: 'api-gateway', url: process.env.API_GATEWAY_URL ?? 'http://localhost:8080' },
  { name: 'identity-service', url: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:8081' },
  { name: 'tenant-service', url: process.env.TENANT_SERVICE_URL ?? 'http://localhost:8082' },
  { name: 'agent-orchestrator', url: process.env.AGENT_ORCHESTRATOR_URL ?? 'http://localhost:8083' },
  { name: 'model-gateway', url: process.env.MODEL_GATEWAY_URL ?? 'http://localhost:8084' },
  { name: 'rag-service', url: process.env.RAG_SERVICE_URL ?? 'http://localhost:8086' },
] as const;

export async function probePlatformHealth(): Promise<ServiceHealth[]> {
  return Promise.all(
    HEALTH_TARGETS.map(async (target) => {
      const started = performance.now();
      try {
        const response = await fetch(`${target.url}/healthz`, {
          signal: AbortSignal.timeout(2500),
        });
        return {
          name: target.name,
          url: target.url,
          status: response.ok ? ('ok' as const) : ('down' as const),
          latencyMs: Math.round(performance.now() - started),
        };
      } catch {
        return {
          name: target.name,
          url: target.url,
          status: 'down' as const,
          latencyMs: Math.round(performance.now() - started),
        };
      }
    }),
  );
}
