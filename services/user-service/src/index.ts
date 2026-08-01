import { AuthVerifier } from '@sull/auth-sdk';
import { baseServiceEnvSchema, kafkaBrokers, loadEnv } from '@sull/config';
import { createPool, ensureOutboxSchema } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createKafka, createProducer } from '@sull/kafka';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { startOutboxRelay } from './outbox.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { UserService } from './service.js';

async function main(): Promise<void> {
  const env = loadEnv(baseServiceEnvSchema);
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

  const pool = createPool(env.DATABASE_URL);
  await pool.query(SCHEMA_SQL);
  await ensureOutboxSchema(pool);

  const users = new UserService(pool);
  const auth = new AuthVerifier({
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    jwksUrl: env.JWKS_URL,
  });

  const kafka = createKafka({
    clientId: env.SERVICE_NAME,
    brokers: kafkaBrokers(env.KAFKA_BROKERS),
    logger,
  });
  const producer = await createProducer(kafka);
  const stopOutbox = startOutboxRelay({ pool, producer, logger });

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
    auth,
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, users, auth);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'user-service listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down user-service');
    stopOutbox();
    await app.close();
    await producer.disconnect();
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
