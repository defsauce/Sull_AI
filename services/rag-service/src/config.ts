import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const ragServiceEnvSchema = baseServiceEnvSchema.extend({
  VECTOR_SERVICE_URL: z.string().url().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(384),
});

export type RagServiceEnv = z.infer<typeof ragServiceEnvSchema>;
