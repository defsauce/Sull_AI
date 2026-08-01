import { z } from 'zod';
import { environmentSchema } from '@sull/config';

export const gatewayEnvSchema = z.object({
  NODE_ENV: environmentSchema.default('development'),
  SERVICE_NAME: z.string().default('api-gateway'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REDIS_URL: z.string().url(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  JWKS_URL: z.string().url(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  IDENTITY_SERVICE_URL: z.string().url(),
  TENANT_SERVICE_URL: z.string().url(),
  USER_SERVICE_URL: z.string().url().optional(),
  AGENT_ORCHESTRATOR_URL: z.string().url().optional(),
  MODEL_GATEWAY_URL: z.string().url().optional(),
  RAG_SERVICE_URL: z.string().url().optional(),
  BILLING_SERVICE_URL: z.string().url().optional(),
  AUDIT_SERVICE_URL: z.string().url().optional(),
  POLICY_SERVICE_URL: z.string().url().optional(),
  FILE_SERVICE_URL: z.string().url().optional(),
  WORKFLOW_ENGINE_URL: z.string().url().optional(),
  SEARCH_SERVICE_URL: z.string().url().optional(),
  NOTIFICATION_SERVICE_URL: z.string().url().optional(),
  EVENT_PROJECTOR_URL: z.string().url().optional(),
  ANALYTICS_SERVICE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  KAFKA_BROKERS: z.string().optional(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;
