import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const searchServiceEnvSchema = baseServiceEnvSchema;

export type SearchServiceEnv = z.infer<typeof searchServiceEnvSchema>;

export const indexDocumentSchema = z.object({
  tenantId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  title: z.string().min(1).max(512),
  body: z.string().min(1).max(2_000_000),
  metadata: z.record(z.unknown()).default({}),
});

export const searchQuerySchema = z.object({
  tenantId: z.string().uuid(),
  q: z.string().min(1).max(1000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type IndexDocumentInput = z.infer<typeof indexDocumentSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
