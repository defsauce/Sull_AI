import { describe, expect, it } from 'vitest';
import { createLogger } from '@sull/logger';
import { createServiceServer } from './index.js';

describe('@sull/http', () => {
  it('serves health endpoints', async () => {
    const logger = createLogger({
      service: 'http-test',
      version: '0.0.0',
      environment: 'test',
      level: 'silent',
    });
    const app = await createServiceServer({ serviceName: 'http-test', logger });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'http-test' });
    await app.close();
  });
});
