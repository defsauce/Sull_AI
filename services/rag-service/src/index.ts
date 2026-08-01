import { loadEnv } from '@sull/config';
import { createPool } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { ragServiceEnvSchema } from './config.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { RagService } from './service.js';
import { createVectorClient } from './vector-client.js';

async function main(): Promise<void> {
  const env = loadEnv(ragServiceEnvSchema);
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
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined
      ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }
      : {}),
  });

  const pool = createPool(env.DATABASE_URL);
  await pool.query(SCHEMA_SQL);

  const vectorClient = createVectorClient(env.VECTOR_SERVICE_URL, env.EMBEDDING_DIMENSIONS);
  const rag = new RagService(pool, vectorClient, '00000000-0000-4000-8000-000000000000');

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, rag);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'rag-service listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down rag-service');
    await app.close();
    await pool.end();
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
