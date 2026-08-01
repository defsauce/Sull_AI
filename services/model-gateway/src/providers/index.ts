import type { ModelInvoke } from '@sull/contracts';
import type { ModelGatewayEnv } from '../config.js';
import { EchoProvider } from './echo.js';
import { OpenAiCompatibleProvider } from './openai.js';
import type { ModelProvider } from './types.js';

export class ProviderRegistry {
  private readonly echo = new EchoProvider();
  private readonly providers = new Map<string, ModelProvider>();

  constructor(env: ModelGatewayEnv) {
    if (env.OPENAI_API_KEY) {
      this.providers.set(
        'openai',
        new OpenAiCompatibleProvider({
          providerName: 'openai',
          apiKey: env.OPENAI_API_KEY,
          baseUrl: env.OPENAI_BASE_URL,
        }),
      );
      this.providers.set(
        'azure_openai',
        new OpenAiCompatibleProvider({
          providerName: 'azure_openai',
          apiKey: env.OPENAI_API_KEY,
          baseUrl: env.OPENAI_BASE_URL,
        }),
      );
      this.providers.set(
        'vllm',
        new OpenAiCompatibleProvider({
          providerName: 'vllm',
          apiKey: env.OPENAI_API_KEY,
          baseUrl: env.OPENAI_BASE_URL,
        }),
      );
    }

    if (env.ANTHROPIC_API_KEY) {
      this.providers.set(
        'anthropic',
        new OpenAiCompatibleProvider({
          providerName: 'anthropic',
          apiKey: env.ANTHROPIC_API_KEY,
          baseUrl: `${env.ANTHROPIC_BASE_URL}/openai`,
        }),
      );
      this.providers.set(
        'bedrock',
        new OpenAiCompatibleProvider({
          providerName: 'bedrock',
          apiKey: env.ANTHROPIC_API_KEY,
          baseUrl: env.OPENAI_BASE_URL,
        }),
      );
    }
  }

  resolve(input: ModelInvoke, echoEnabled: boolean): ModelProvider {
    if (echoEnabled) {
      return this.echo;
    }
    const provider = this.providers.get(input.provider);
    if (provider) {
      return provider;
    }
    return this.echo;
  }
}

export { EchoProvider } from './echo.js';
export type { ModelProvider, ProviderCompletion } from './types.js';
