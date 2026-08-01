import { ulid } from 'ulid';
import { z } from 'zod';

export const cloudEventSchema = z.object({
  specversion: z.literal('1.0'),
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  time: z.string().datetime(),
  datacontenttype: z.literal('application/json'),
  subject: z.string().optional(),
  dataschema: z.string().url().optional(),
  traceparent: z.string().optional(),
  tenantid: z.string().uuid(),
  aggregateid: z.string().min(1),
  aggregatetype: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  data: z.unknown(),
});

export type CloudEvent<T = unknown> = Omit<z.infer<typeof cloudEventSchema>, 'data'> & {
  data: T;
};

export interface CreateEventInput<T> {
  readonly type: string;
  readonly source: string;
  readonly tenantId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly sequence: number;
  readonly data: T;
  readonly subject?: string;
  readonly dataSchema?: string;
  readonly traceparent?: string;
  readonly id?: string;
  readonly time?: string;
}

export function createCloudEvent<T>(input: CreateEventInput<T>): CloudEvent<T> {
  return {
    specversion: '1.0',
    id: input.id ?? ulid(),
    source: input.source,
    type: input.type,
    time: input.time ?? new Date().toISOString(),
    datacontenttype: 'application/json',
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.dataSchema !== undefined ? { dataschema: input.dataSchema } : {}),
    ...(input.traceparent !== undefined ? { traceparent: input.traceparent } : {}),
    tenantid: input.tenantId,
    aggregateid: input.aggregateId,
    aggregatetype: input.aggregateType,
    sequence: input.sequence,
    data: input.data,
  };
}

export function parseCloudEvent<T>(
  payload: unknown,
  dataSchema: z.ZodType<T>,
): CloudEvent<T> {
  const envelope = cloudEventSchema.parse(payload);
  const data = dataSchema.parse(envelope.data);
  return { ...envelope, data };
}

export function topicFor(context: string, version = 'v1'): string {
  return `sull.${context}.events.${version}`;
}

export const EventTypes = {
  TenantCreated: 'com.sull.tenant.created.v1',
  TenantUpdated: 'com.sull.tenant.updated.v1',
  TenantSuspended: 'com.sull.tenant.suspended.v1',
  UserRegistered: 'com.sull.user.registered.v1',
  UserUpdated: 'com.sull.user.updated.v1',
  MembershipGranted: 'com.sull.user.membership.granted.v1',
  SessionCreated: 'com.sull.identity.session.created.v1',
  SessionRevoked: 'com.sull.identity.session.revoked.v1',
  ApiKeyCreated: 'com.sull.identity.apikey.created.v1',
  ApiKeyRevoked: 'com.sull.identity.apikey.revoked.v1',
  InvoiceIssued: 'com.sull.billing.invoice.issued.v1',
  UsageRecorded: 'com.sull.billing.usage.recorded.v1',
  AuditRecorded: 'com.sull.audit.recorded.v1',
  NotificationQueued: 'com.sull.notification.queued.v1',
  FileUploaded: 'com.sull.file.uploaded.v1',
  AgentRunStarted: 'com.sull.agent.run.started.v1',
  AgentRunCompleted: 'com.sull.agent.run.completed.v1',
  AgentRunFailed: 'com.sull.agent.run.failed.v1',
  ModelInvocationCompleted: 'com.sull.model.invocation.completed.v1',
  DocumentIngested: 'com.sull.rag.document.ingested.v1',
  RetrievalCompleted: 'com.sull.rag.retrieval.completed.v1',
  WorkflowStarted: 'com.sull.workflow.started.v1',
  WorkflowCompleted: 'com.sull.workflow.completed.v1',
  PolicyBundlePublished: 'com.sull.policy.bundle.published.v1',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const tenantCreatedDataSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  plan: z.enum(['free', 'pro', 'enterprise']),
  createdBy: z.string().uuid(),
});

export const userRegisteredDataSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
});

export const agentRunStartedDataSchema = z.object({
  runId: z.string().uuid(),
  agentGraphId: z.string().min(1),
  initiatedBy: z.string().uuid(),
  inputRef: z.string().min(1),
});

export const usageRecordedDataSchema = z.object({
  usageId: z.string().uuid(),
  meter: z.enum(['tokens', 'requests', 'storage_gb', 'seats']),
  quantity: z.number().positive(),
  unitCostUsd: z.number().nonnegative(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
});

export const auditRecordedDataSchema = z.object({
  auditId: z.string().uuid(),
  actorId: z.string().min(1),
  actorType: z.enum(['user', 'service', 'system']),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  outcome: z.enum(['success', 'denied', 'failure']),
  metadata: z.record(z.unknown()).default({}),
});
