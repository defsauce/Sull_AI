import { AuthVerifier } from '@sull/auth-sdk';
import { loadEnv } from '@sull/config';
import { createServiceServer } from '@sull/http';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { gatewayEnvSchema } from './config.js';
import { pickForwardHeaders, proxyRequest, resolveUpstream } from './proxy.js';

async function main(): Promise<void> {
  const env = loadEnv(gatewayEnvSchema);
  const logger = createLogger({
    service: env.SERVICE_NAME,
    version: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    level: env.LOG_LEVEL,
  });

  await startTelemetry({
    serviceName: env.SERVICE_NAME,
    serviceVersion: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const auth = new AuthVerifier({
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    jwksUrl: env.JWKS_URL,
  });

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
    auth,
    rateLimitMax: 600,
  });

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/*',
    handler: async (request, reply) => {
      const path = request.url;
      if (path === '/healthz' || path === '/readyz') {
        return reply.send({ status: 'ok', service: env.SERVICE_NAME });
      }

      const publicPath =
        path.startsWith('/v1/auth/login') ||
        path.startsWith('/v1/auth/register') ||
        path.startsWith('/v1/auth/refresh') ||
        path.startsWith('/.well-known/');

      if (!publicPath) {
        request.principal = await auth.verifyBearerToken(request.headers.authorization);
      }

      const upstream = resolveUpstream(path.split('?')[0] ?? path, env);
      const body =
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : Buffer.from(JSON.stringify(request.body ?? {}));

      const proxied = await proxyRequest({
        upstreamBaseUrl: upstream,
        method: request.method,
        path,
        headers: pickForwardHeaders(
          request.headers as Record<string, string | string[] | undefined>,
          request.id,
          request.headers.authorization,
        ),
        body,
      });

      const contentType = proxied.headers['content-type'] ?? 'application/json';
      return reply.status(proxied.statusCode).header('content-type', contentType).send(proxied.body);
    },
  });

  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'api-gateway listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down api-gateway');
    await app.close();
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
