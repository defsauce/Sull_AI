import { z } from 'zod';
import { baseServiceEnvSchema } from '@sull/config';

export const identityEnvSchema = baseServiceEnvSchema.extend({
  IDENTITY_JWT_PRIVATE_KEY_PEM: z.string().min(32),
  IDENTITY_JWT_PUBLIC_KEY_PEM: z.string().min(32),
  IDENTITY_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  IDENTITY_REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(2_592_000),
  IDENTITY_ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19_456),
  IDENTITY_PLATFORM_TENANT_ID: z
    .string()
    .uuid()
    .default('00000000-0000-4000-8000-000000000001'),
});

export type IdentityEnv = z.infer<typeof identityEnvSchema>;
