import { z } from 'zod';
import { baseServiceEnvSchema } from '@sull/config';

export const projectorEnvSchema = baseServiceEnvSchema.extend({
  KAFKA_CONSUMER_GROUP: z.string().min(1).default('sull-event-projector'),
});

export type ProjectorEnv = z.infer<typeof projectorEnvSchema>;

export const PROJECTOR_TOPICS = [
  'sull.tenant.events.v1',
  'sull.user.events.v1',
  'sull.billing.events.v1',
] as const;
