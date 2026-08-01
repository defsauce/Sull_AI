import { AuthVerifier } from '@sull/auth-sdk';
import { kafkaBrokers, loadEnv } from '@sull/config';
import { createPool, ensureOutboxSchema } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createKafka, createProducer, runConsumer } from '@sull/kafka';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { PROJECTOR_TOPICS, projectorEnvSchema } from './config.js';
import { startOutboxRelay } from './outbox.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { ProjectorService, shouldProjectEvent } from './service.js';

async function main(): Promise<void> {
  const env = loadEnv(projectorEnvSchema);
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

  const projector = new ProjectorService(pool, env.KAFKA_CONSUMER_GROUP);
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

  const consumer = await runConsumer({
    kafka,
    groupId: env.KAFKA_CONSUMER_GROUP,
    topics: [...PROJECTOR_TOPICS],
    logger,
    handler: async ({ topic, partition, event, raw }) => {
      if (!shouldProjectEvent(event.type)) {
        return;
      }
      await projector.handleEvent(event, topic, partition, raw.message.offset);
    },
  });

  const app = await createServiceServer({
    serviceName: env.SERVICE_NAME,
    logger,
    auth,
  });

  app.get('/readyz', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready', service: env.SERVICE_NAME, consumerGroup: env.KAFKA_CONSUMER_GROUP };
  });

  await registerRoutes(app, projector, auth);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT, topics: PROJECTOR_TOPICS }, 'event-projector listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down event-projector');
    stopOutbox();
    await consumer.disconnect();
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
