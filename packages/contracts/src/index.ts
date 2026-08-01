import { z } from 'zod';

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const tenantCreateSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
});

export const tenantResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  plan: z.enum(['free', 'pro', 'enterprise']),
  status: z.enum(['active', 'suspended', 'deleted']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userRegisterSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(120),
  password: z.string().min(12).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().length(6).optional(),
});

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
});

export const agentRunCreateSchema = z.object({
  agentGraphId: z.string().min(1).max(128),
  input: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export const agentRunResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  agentGraphId: z.string(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const modelInvokeSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'azure_openai', 'bedrock', 'vllm']),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
      }),
    )
    .min(1),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().max(128_000).default(2048),
});

export const ragIngestSchema = z.object({
  collectionId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  title: z.string().min(1).max(512),
  contentType: z.enum(['text/plain', 'text/markdown', 'application/pdf', 'text/html']),
  content: z.string().min(1).max(2_000_000),
  metadata: z.record(z.unknown()).default({}),
});

export const ragQuerySchema = z.object({
  collectionId: z.string().uuid(),
  query: z.string().min(1).max(8_000),
  topK: z.number().int().min(1).max(50).default(8),
  filters: z.record(z.unknown()).optional(),
});

export type TenantCreate = z.infer<typeof tenantCreateSchema>;
export type TenantResponse = z.infer<typeof tenantResponseSchema>;
export type UserRegister = z.infer<typeof userRegisterSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type AgentRunCreate = z.infer<typeof agentRunCreateSchema>;
export type ModelInvoke = z.infer<typeof modelInvokeSchema>;
export type RagIngest = z.infer<typeof ragIngestSchema>;
export type RagQuery = z.infer<typeof ragQuerySchema>;
