import { createHash } from 'node:crypto';
import type { ModelInvoke } from '@sull/contracts';
import type { ModelProvider, ProviderCompletion } from './types.js';

export class EchoProvider implements ModelProvider {
  readonly name = 'echo';

  async invoke(input: ModelInvoke): Promise<ProviderCompletion> {
    const digest = createHash('sha256')
      .update(JSON.stringify({ model: input.model, messages: input.messages }))
      .digest('hex')
      .slice(0, 16);

    const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
    const promptText = input.messages.map((message) => message.content).join('\n');
    const promptTokens = estimateTokens(promptText);
    const content = `echo:${input.model}:${digest}:${lastUser?.content ?? 'empty'}`;
    const completionTokens = estimateTokens(content);

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      model: input.model,
      provider: this.name,
    };
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
