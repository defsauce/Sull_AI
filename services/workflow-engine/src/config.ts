import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const workflowEngineEnvSchema = baseServiceEnvSchema;

export type WorkflowEngineEnv = z.infer<typeof workflowEngineEnvSchema>;

export const workflowStepDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  action: z.string().min(1).max(128),
  compensation: z.string().min(1).max(128).optional(),
});

export const workflowDefinitionCreateSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(128),
  steps: z.array(workflowStepDefinitionSchema).min(1).max(50),
});

export const workflowInstanceCreateSchema = z.object({
  tenantId: z.string().uuid(),
  definitionId: z.string().uuid(),
  input: z.record(z.unknown()).default({}),
});

export type WorkflowStepDefinition = z.infer<typeof workflowStepDefinitionSchema>;
export type WorkflowDefinitionCreate = z.infer<typeof workflowDefinitionCreateSchema>;
export type WorkflowInstanceCreate = z.infer<typeof workflowInstanceCreateSchema>;
