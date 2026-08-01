import { describe, expect, it } from 'vitest';
import { createLogger } from './index.js';

describe('createLogger', () => {
  it('creates a structured logger with service bindings', () => {
    const logger = createLogger({
      service: 'identity-service',
      version: '0.1.0',
      environment: 'test',
      level: 'silent',
    });
    expect(logger.bindings().service).toBe('identity-service');
  });
});
