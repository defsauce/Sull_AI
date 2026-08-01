import { z } from 'zod';

export const environmentSchema = z.enum(['development', 'test', 'staging', 'production']);

export const baseServiceEnvSchema = z.object({
  NODE_ENV: environmentSchema.default('development'),
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().default('0.1.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  JWKS_URL: z.string().url(),
  OPA_URL: z.string().url().optional(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type BaseServiceEnv = z.infer<typeof baseServiceEnvSchema>;

export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export function kafkaBrokers(raw: string): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0);
}
