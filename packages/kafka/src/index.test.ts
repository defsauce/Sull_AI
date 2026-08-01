import { describe, expect, it } from 'vitest';
import { createKafka } from './index.js';
import { createLogger } from '@sull/logger';

describe('@sull/kafka', () => {
  it('creates a Kafka client with configured brokers', () => {
    const logger = createLogger({
      service: 'test',
      version: '0.0.0',
      environment: 'test',
      level: 'silent',
    });
    const kafka = createKafka({
      clientId: 'test',
      brokers: ['localhost:19092'],
      logger,
    });
    expect(kafka).toBeTruthy();
  });
});
