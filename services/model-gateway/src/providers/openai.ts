import { dependencyFailed } from '@sull/errors';
import type { ModelInvoke } from '@sull/contracts';
import type { ModelProvider, ProviderCompletion } from './types.js';

export interface OpenAiCompatibleProviderOptions {
  readonly providerName: string;
  readonly apiKey: string;
  readonly baseUrl: string;
}

export class OpenAiCompatibleProvider implements ModelProvider {
  readonly name: string;

  constructor(private readonly options: OpenAiCompatibleProviderOptions) {
    this.name = options.providerName;
  }

  async invoke(input: ModelInvoke): Promise<ProviderCompletion> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw dependencyFailed(`${this.name} returned ${response.status}`, body);
    }

    const payload = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = payload.choices[0]?.message.content ?? '';
    const promptTokens = payload.usage?.prompt_tokens ?? estimateTokens(input.messages);
    const completionTokens = payload.usage?.completion_tokens ?? estimateTokens(content);

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens: payload.usage?.total_tokens ?? promptTokens + completionTokens,
      model: payload.model,
      provider: this.name,
    };
  }
}

function estimateTokens(messagesOrText: ModelInvoke['messages'] | string): number {
  const text =
    typeof messagesOrText === 'string'
      ? messagesOrText
      : messagesOrText.map((message) => message.content).join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
}
