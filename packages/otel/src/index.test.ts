import { describe, expect, it } from 'vitest';
import { getMeter, getTracer } from './index.js';

describe('@sull/otel', () => {
  it('returns tracers and meters from the global API', () => {
    expect(getTracer('test').startSpan).toBeTypeOf('function');
    expect(getMeter('test').createCounter).toBeTypeOf('function');
  });
});
