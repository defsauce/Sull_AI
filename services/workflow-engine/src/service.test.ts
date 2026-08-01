import { describe, expect, it } from 'vitest';
import { executeStepAction } from './service.js';

describe('executeStepAction', () => {
  it('validates input context', () => {
    const output = executeStepAction('validate-input', { orderId: '123' });
    expect(output.valid).toBe(true);
    expect(output.fields).toContain('orderId');
  });

  it('throws for explicit fail action', () => {
    expect(() => executeStepAction('fail', {})).toThrow('Step configured to fail');
  });
});
