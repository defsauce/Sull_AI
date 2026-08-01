import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const modelGatewayEnvSchema = baseServiceEnvSchema.extend({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  ECHO_PROVIDER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DEFAULT_MAX_TOKENS_PER_DAY: z.coerce.number().int().positive().default(1_000_000),
  DEFAULT_MAX_SPEND_USD_PER_DAY: z.coerce.number().positive().default(100),
  TOKEN_COST_USD_PER_1K: z.coerce.number().nonnegative().default(0.002),
});

export type ModelGatewayEnv = z.infer<typeof modelGatewayEnvSchema>;
