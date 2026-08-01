import { Redis } from 'ioredis';
import { AuthVerifier } from '@sull/auth-sdk';
import { kafkaBrokers, loadEnv } from '@sull/config';
import { createPool, ensureOutboxSchema } from '@sull/db';
import { createServiceServer } from '@sull/http';
import { createKafka, createProducer } from '@sull/kafka';
import { createLogger } from '@sull/logger';
import { shutdownTelemetry, startTelemetry } from '@sull/otel';
import { modelGatewayEnvSchema } from './config.js';
import { startOutboxRelay } from './outbox.js';
import { TenantRateLimiter } from './rate-limiter.js';
import { registerRoutes } from './routes.js';
import { SCHEMA_SQL } from './schema.js';
import { ModelGatewayService } from './service.js';

async function main(): Promise<void> {
  const env = loadEnv(modelGatewayEnvSchema);
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
  await ensureOutboxSchema(pool);

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const rateLimiter = new TenantRateLimiter(redis, {
    maxTokensPerDay: env.DEFAULT_MAX_TOKENS_PER_DAY,
    maxSpendUsdPerDay: env.DEFAULT_MAX_SPEND_USD_PER_DAY,
  });
  const gateway = new ModelGatewayService(pool, redis, env, rateLimiter);

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
    await redis.ping();
    return { status: 'ready', service: env.SERVICE_NAME };
  });

  await registerRoutes(app, gateway, rateLimiter, auth);
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, 'model-gateway listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down model-gateway');
    stopOutbox();
    await app.close();
    await producer.disconnect();
    redis.disconnect();
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
