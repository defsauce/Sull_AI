import { describe, expect, it } from 'vitest';
import { baseServiceEnvSchema, kafkaBrokers, loadEnv } from './index.js';

describe('loadEnv', () => {
  it('parses valid base service environment', () => {
    const env = loadEnv(baseServiceEnvSchema, {
      SERVICE_NAME: 'identity-service',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/identity',
      REDIS_URL: 'redis://localhost:6379/0',
      KAFKA_BROKERS: 'localhost:19092,localhost:19093',
      JWT_ISSUER: 'https://auth.sull.ai',
      JWT_AUDIENCE: 'sull-api',
      JWKS_URL: 'https://auth.sull.ai/.well-known/jwks.json',
    });
    expect(env.SERVICE_NAME).toBe('identity-service');
    expect(env.PORT).toBe(8080);
    expect(kafkaBrokers(env.KAFKA_BROKERS)).toEqual(['localhost:19092', 'localhost:19093']);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      loadEnv(baseServiceEnvSchema, {
        SERVICE_NAME: 'identity-service',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
