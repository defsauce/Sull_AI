import { describe, expect, it } from 'vitest';
import { EchoProvider } from './echo.js';

describe('EchoProvider', () => {
  it('returns deterministic completions', async () => {
    const provider = new EchoProvider();
    const input = {
      provider: 'vllm' as const,
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'hello' }],
      temperature: 0.2,
      maxTokens: 128,
    };

    const first = await provider.invoke(input);
    const second = await provider.invoke(input);

    expect(first.content).toBe(second.content);
    expect(first.content.startsWith('echo:test-model:')).toBe(true);
    expect(first.totalTokens).toBeGreaterThan(0);
  });
});
