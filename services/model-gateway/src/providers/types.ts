import type { ModelInvoke } from '@sull/contracts';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ProviderCompletion {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
}

export interface ModelProvider {
  readonly name: string;
  invoke(input: ModelInvoke): Promise<ProviderCompletion>;
}

export function toProviderMessages(messages: ModelInvoke['messages']): ProviderMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
