import { loadEnv } from '@sull/config';
import { createPool } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { workflowEngineEnvSchema } from './config.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { WorkflowEngineService } from './service.js';

async function main(): Promise<void> {
  const env = loadEnv(workflowEngineEnvSchema);
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
  const workflows = new WorkflowEngineService(pool);

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, workflows);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'workflow-engine listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workflow-engine');
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
