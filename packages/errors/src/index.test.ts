import { describe, expect, it } from 'vitest';
import { SullError, notFound, validation } from './index.js';

describe('SullError', () => {
  it('maps not found to 404 problem details', () => {
    const err = notFound('Tenant');
    const problem = err.toProblemDetails('trace-1', '/tenants/abc');
    expect(problem.status).toBe(404);
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.traceId).toBe('trace-1');
    expect(problem.instance).toBe('/tenants/abc');
  });

  it('includes validation details', () => {
    const err = validation('Invalid payload', [{ field: 'email', message: 'must be email' }]);
    expect(err).toBeInstanceOf(SullError);
    expect(err.details).toHaveLength(1);
    expect(err.status).toBe(422);
  });
});
