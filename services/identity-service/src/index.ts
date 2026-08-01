import { loadEnv, kafkaBrokers } from '@sull/config';
import { createPool, ensureOutboxSchema, ensureIdempotencySchema } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createKafka, createProducer } from '@sull/kafka';
import { createLogger } from '@sull/logger';
import { startTelemetry, shutdownTelemetry } from '@sull/otel';
import { identityEnvSchema } from './config.js';
import { startOutboxRelay } from './outbox.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { IdentityService } from './service.js';

async function main(): Promise<void> {
  const env = loadEnv(identityEnvSchema);
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
  await ensureIdempotencySchema(pool);

  const identity = new IdentityService(pool, env);
  await identity.initKeys();

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
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, identity);

  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'identity-service listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down identity-service');
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
