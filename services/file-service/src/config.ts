import { z } from 'zod';
import { baseServiceEnvSchema } from '@sull/config';

export const fileEnvSchema = baseServiceEnvSchema.extend({
  AWS_S3_BUCKET: z.string().min(1),
  AWS_S3_REGION: z.string().min(1),
  AWS_S3_ENDPOINT: z.string().url().optional(),
  AWS_S3_ACCESS_KEY_ID: z.string().min(1),
  AWS_S3_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AWS_S3_SIGNED_URL_TTL_SEC: z.coerce.number().int().positive().default(900),
});

export type FileEnv = z.infer<typeof fileEnvSchema>;
