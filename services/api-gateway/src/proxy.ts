import { request as undiciRequest } from 'undici';
import { dependencyFailed, unavailable } from '@sull/errors';

export interface ProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
}

export async function proxyRequest(options: {
  upstreamBaseUrl: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs?: number;
}): Promise<ProxyResult> {
  const url = new URL(options.path, options.upstreamBaseUrl).toString();
  try {
    const response = await undiciRequest(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      headersTimeout: options.timeoutMs ?? 10_000,
      bodyTimeout: options.timeoutMs ?? 30_000,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of response.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    return {
      statusCode: response.statusCode,
      headers,
      body: Buffer.concat(chunks),
    };
  } catch (error) {
    throw unavailable(
      `Upstream ${options.upstreamBaseUrl} unavailable: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

export function pickForwardHeaders(
  incoming: Record<string, string | string[] | undefined>,
  requestId: string,
  authorization?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-request-id': requestId,
    accept: 'application/json',
  };
  if (authorization) {
    headers.authorization = authorization;
  }
  const contentType = incoming['content-type'];
  if (typeof contentType === 'string') {
    headers['content-type'] = contentType;
  }
  const traceparent = incoming['traceparent'];
  if (typeof traceparent === 'string') {
    headers.traceparent = traceparent;
  }
  return headers;
}

export interface UpstreamEnv {
  IDENTITY_SERVICE_URL: string;
  TENANT_SERVICE_URL: string;
  USER_SERVICE_URL?: string;
  AGENT_ORCHESTRATOR_URL?: string;
  MODEL_GATEWAY_URL?: string;
  RAG_SERVICE_URL?: string;
  BILLING_SERVICE_URL?: string;
  AUDIT_SERVICE_URL?: string;
  POLICY_SERVICE_URL?: string;
  FILE_SERVICE_URL?: string;
  WORKFLOW_ENGINE_URL?: string;
  SEARCH_SERVICE_URL?: string;
  NOTIFICATION_SERVICE_URL?: string;
  EVENT_PROJECTOR_URL?: string;
  ANALYTICS_SERVICE_URL?: string;
}

export function resolveUpstream(path: string, env: UpstreamEnv): string {
  if (path.startsWith('/v1/auth') || path.startsWith('/.well-known')) {
    return env.IDENTITY_SERVICE_URL;
  }
  if (path.startsWith('/v1/tenants')) {
    return env.TENANT_SERVICE_URL;
  }
  if (path.startsWith('/v1/users') && env.USER_SERVICE_URL) {
    return env.USER_SERVICE_URL;
  }
  if (
    (path.startsWith('/v1/agents') || path.startsWith('/v1/agent-runs')) &&
    env.AGENT_ORCHESTRATOR_URL
  ) {
    return env.AGENT_ORCHESTRATOR_URL;
  }
  if (path.startsWith('/v1/models') && env.MODEL_GATEWAY_URL) {
    return env.MODEL_GATEWAY_URL;
  }
  if (path.startsWith('/v1/rag') && env.RAG_SERVICE_URL) {
    return env.RAG_SERVICE_URL;
  }
  if (path.startsWith('/v1/billing') && env.BILLING_SERVICE_URL) {
    return env.BILLING_SERVICE_URL;
  }
  if (path.startsWith('/v1/audit') && env.AUDIT_SERVICE_URL) {
    return env.AUDIT_SERVICE_URL;
  }
  if (path.startsWith('/v1/policies') && env.POLICY_SERVICE_URL) {
    return env.POLICY_SERVICE_URL;
  }
  if (path.startsWith('/v1/files') && env.FILE_SERVICE_URL) {
    return env.FILE_SERVICE_URL;
  }
  if (path.startsWith('/v1/workflow') && env.WORKFLOW_ENGINE_URL) {
    return env.WORKFLOW_ENGINE_URL;
  }
  if (path.startsWith('/v1/search') && env.SEARCH_SERVICE_URL) {
    return env.SEARCH_SERVICE_URL;
  }
  if (path.startsWith('/v1/notifications') && env.NOTIFICATION_SERVICE_URL) {
    return env.NOTIFICATION_SERVICE_URL;
  }
  if (path.startsWith('/v1/projections') && env.EVENT_PROJECTOR_URL) {
    return env.EVENT_PROJECTOR_URL;
  }
  if (path.startsWith('/v1/metrics') && env.ANALYTICS_SERVICE_URL) {
    return env.ANALYTICS_SERVICE_URL;
  }
  throw dependencyFailed(`No upstream route for ${path}`);
}
