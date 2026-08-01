import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const vectorServiceEnvSchema = baseServiceEnvSchema.extend({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(384),
});

export type VectorServiceEnv = z.infer<typeof vectorServiceEnvSchema>;
