import { loadEnv } from '@sull/config';
import { createPool } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { vectorServiceEnvSchema } from './config.js';
import { EmbeddingClient } from './embeddings.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { VectorStore } from './store.js';

async function main(): Promise<void> {
  const env = loadEnv(vectorServiceEnvSchema);
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

  const embeddings = new EmbeddingClient({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
  });
  const store = new VectorStore(pool, embeddings);

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, store);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'vector-service listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down vector-service');
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
