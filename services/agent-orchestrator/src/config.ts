import { baseServiceEnvSchema } from '@sull/config';
import { z } from 'zod';

export const agentOrchestratorEnvSchema = baseServiceEnvSchema;

export type AgentOrchestratorEnv = z.infer<typeof agentOrchestratorEnvSchema>;
