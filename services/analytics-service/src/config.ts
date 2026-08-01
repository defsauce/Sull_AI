import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const analyticsServiceEnvSchema = baseServiceEnvSchema;

export type AnalyticsServiceEnv = z.infer<typeof analyticsServiceEnvSchema>;

export const recordUsageSchema = z.object({
  tenantId: z.string().uuid(),
  meter: z.enum(['tokens', 'requests', 'storage_gb', 'seats']),
  quantity: z.number().positive(),
  unitCostUsd: z.number().nonnegative().default(0),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  recordedAt: z.string().datetime().optional(),
});

export const usageAggregateQuerySchema = z.object({
  tenantId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  meter: z.enum(['tokens', 'requests', 'storage_gb', 'seats']).optional(),
});

export type RecordUsageInput = z.infer<typeof recordUsageSchema>;
export type UsageAggregateQuery = z.infer<typeof usageAggregateQuerySchema>;
