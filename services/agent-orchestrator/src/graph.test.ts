import { describe, expect, it } from 'vitest';
import { executeAgentGraph, GRAPH_STEPS } from './graph.js';

describe('executeAgentGraph', () => {
  it('executes planner, researcher, critic, and executor in order', () => {
    const result = executeAgentGraph({
      objective: 'Summarize quarterly revenue trends',
      context: ['Revenue grew 12% year over year', 'Enterprise segment led growth'],
      audience: 'executive team',
    });

    expect(result.steps.map((step) => step.stepName)).toEqual([...GRAPH_STEPS]);
    expect(result.steps.every((step) => step.status === 'completed')).toBe(true);
    expect(result.output.answer).toContain('Summarize quarterly revenue trends');
    expect(result.output.qualityScore).toBeGreaterThan(0);
  });

  it('marks critic feedback when research is thin', () => {
    const result = executeAgentGraph({ query: 'Quick check' });
    const critic = result.steps.find((step) => step.stepName === 'critic');
    expect(critic?.output['approved']).toBe(false);
    expect(Array.isArray(critic?.output['feedback'])).toBe(true);
  });
});
