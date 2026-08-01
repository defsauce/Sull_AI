import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { conflict, forbidden, notFound } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';

export interface SubscriptionRecord {
  id: string;
  tenant_id: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'cancelled';
  current_period_start: Date;
  current_period_end: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UsageRecord {
  id: string;
  tenant_id: string;
  meter: 'tokens' | 'requests' | 'storage_gb' | 'seats';
  quantity: string;
  unit_cost_usd: string;
  model_provider: string | null;
  model_name: string | null;
  idempotency_key: string;
  recorded_at: Date;
}

export interface InvoiceRecord {
  id: string;
  tenant_id: string;
  subscription_id: string;
  amount_usd: string;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  period_start: Date;
  period_end: Date;
  line_items: Array<{ description: string; quantity: number; unitCostUsd: number; amountUsd: number }>;
  issued_at: Date;
  created_at: Date;
}

export interface CreateSubscriptionInput {
  tenantId: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface RecordUsageInput {
  tenantId: string;
  meter: 'tokens' | 'requests' | 'storage_gb' | 'seats';
  quantity: number;
  unitCostUsd: number;
  modelProvider?: string | undefined;
  modelName?: string | undefined;
  idempotencyKey: string;
}

export interface IssueInvoiceInput {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
}

const PLAN_RATES: Record<'free' | 'pro' | 'enterprise', Record<string, number>> = {
  free: { tokens: 0, requests: 0, storage_gb: 0, seats: 0 },
  pro: { tokens: 0.000002, requests: 0.001, storage_gb: 0.1, seats: 15 },
  enterprise: { tokens: 0.0000015, requests: 0.0008, storage_gb: 0.08, seats: 25 },
};

export class BillingService {
  constructor(private readonly pool: Pool) {}

  async createSubscription(
    principal: Principal,
    input: CreateSubscriptionInput,
  ): Promise<SubscriptionRecord> {
    assertTenantAccess(principal, input.tenantId);
    if (!principal.roles.includes('platform_admin') && !principal.roles.includes('tenant_admin')) {
      throw forbidden('Only tenant or platform admins can manage subscriptions');
    }

    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM subscriptions WHERE tenant_id = $1`,
        [input.tenantId],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict(`Subscription already exists for tenant '${input.tenantId}'`);
      }

      const inserted = await client.query<SubscriptionRecord>(
        `INSERT INTO subscriptions (tenant_id, plan)
         VALUES ($1, $2)
         RETURNING id, tenant_id, plan, status, current_period_start, current_period_end, created_at, updated_at`,
        [input.tenantId, input.plan],
      );
      return inserted.rows[0]!;
    });
  }

  async getSubscriptionByTenant(
    principal: Principal,
    tenantId: string,
  ): Promise<SubscriptionRecord> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<SubscriptionRecord>(
      `SELECT id, tenant_id, plan, status, current_period_start, current_period_end, created_at, updated_at
       FROM subscriptions WHERE tenant_id = $1`,
      [tenantId],
    );
    const subscription = result.rows[0];
    if (!subscription) {
      throw notFound('Subscription');
    }
    return subscription;
  }

  async getSubscriptionById(
    principal: Principal,
    subscriptionId: string,
  ): Promise<SubscriptionRecord> {
    const result = await this.pool.query<SubscriptionRecord>(
      `SELECT id, tenant_id, plan, status, current_period_start, current_period_end, created_at, updated_at
       FROM subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    const subscription = result.rows[0];
    if (!subscription) {
      throw notFound('Subscription');
    }
    assertTenantAccess(principal, subscription.tenant_id);
    return subscription;
  }

  async recordUsage(principal: Principal, input: RecordUsageInput): Promise<UsageRecord> {
    assertTenantAccess(principal, input.tenantId);

    return withTransaction(this.pool, async (client) => {
      const existing = await client.query<UsageRecord>(
        `SELECT id, tenant_id, meter, quantity, unit_cost_usd, model_provider, model_name, idempotency_key, recorded_at
         FROM usage_records WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (existing.rows[0]) {
        return existing.rows[0];
      }

      const inserted = await client.query<UsageRecord>(
        `INSERT INTO usage_records (tenant_id, meter, quantity, unit_cost_usd, model_provider, model_name, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tenant_id, meter, quantity, unit_cost_usd, model_provider, model_name, idempotency_key, recorded_at`,
        [
          input.tenantId,
          input.meter,
          input.quantity,
          input.unitCostUsd,
          input.modelProvider ?? null,
          input.modelName ?? null,
          input.idempotencyKey,
        ],
      );
      const usage = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.UsageRecorded,
        source: 'billing-service',
        tenantId: input.tenantId,
        aggregateId: usage.id,
        aggregateType: 'usage',
        sequence: Number(Date.now()),
        data: {
          usageId: usage.id,
          meter: usage.meter,
          quantity: Number(usage.quantity),
          unitCostUsd: Number(usage.unit_cost_usd),
          ...(usage.model_provider ? { modelProvider: usage.model_provider } : {}),
          ...(usage.model_name ? { modelName: usage.model_name } : {}),
        },
      });
      await insertOutboxEvent(client, event, topicFor('billing'));
      return usage;
    });
  }

  async listUsage(
    principal: Principal,
    tenantId: string,
    limit: number,
  ): Promise<UsageRecord[]> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<UsageRecord>(
      `SELECT id, tenant_id, meter, quantity, unit_cost_usd, model_provider, model_name, idempotency_key, recorded_at
       FROM usage_records
       WHERE tenant_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows;
  }

  async issueInvoice(principal: Principal, input: IssueInvoiceInput): Promise<InvoiceRecord> {
    assertTenantAccess(principal, input.tenantId);
    if (!principal.roles.includes('platform_admin') && !principal.roles.includes('billing_admin')) {
      throw forbidden('Only billing or platform admins can issue invoices');
    }

    return withTransaction(this.pool, async (client) => {
      const subscriptionResult = await client.query<SubscriptionRecord>(
        `SELECT id, tenant_id, plan, status, current_period_start, current_period_end, created_at, updated_at
         FROM subscriptions WHERE tenant_id = $1 AND status = 'active'`,
        [input.tenantId],
      );
      const subscription = subscriptionResult.rows[0];
      if (!subscription) {
        throw notFound('Subscription');
      }

      const usageResult = await client.query<{ meter: UsageRecord['meter']; total_quantity: string }>(
        `SELECT meter, SUM(quantity) AS total_quantity
         FROM usage_records
         WHERE tenant_id = $1 AND recorded_at >= $2::timestamptz AND recorded_at < $3::timestamptz
         GROUP BY meter`,
        [input.tenantId, input.periodStart, input.periodEnd],
      );

      const rates = PLAN_RATES[subscription.plan];
      const lineItems = usageResult.rows.map((row) => {
        const quantity = Number(row.total_quantity);
        const unitCostUsd = rates[row.meter] ?? 0;
        return {
          description: `${row.meter} usage`,
          quantity,
          unitCostUsd,
          amountUsd: quantity * unitCostUsd,
        };
      });
      const amountUsd = lineItems.reduce((sum, item) => sum + item.amountUsd, 0);

      const inserted = await client.query<InvoiceRecord>(
        `INSERT INTO invoices (tenant_id, subscription_id, amount_usd, period_start, period_end, line_items)
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb)
         RETURNING id, tenant_id, subscription_id, amount_usd, currency, status, period_start, period_end, line_items, issued_at, created_at`,
        [
          input.tenantId,
          subscription.id,
          amountUsd,
          input.periodStart,
          input.periodEnd,
          JSON.stringify(lineItems),
        ],
      );
      const invoice = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.InvoiceIssued,
        source: 'billing-service',
        tenantId: input.tenantId,
        aggregateId: invoice.id,
        aggregateType: 'invoice',
        sequence: Number(Date.now()),
        data: {
          invoiceId: invoice.id,
          tenantId: invoice.tenant_id,
          amountUsd: Number(invoice.amount_usd),
          currency: invoice.currency,
          periodStart: invoice.period_start.toISOString(),
          periodEnd: invoice.period_end.toISOString(),
        },
      });
      await insertOutboxEvent(client, event, topicFor('billing'));
      return invoice;
    });
  }

  async getInvoice(principal: Principal, invoiceId: string): Promise<InvoiceRecord> {
    const result = await this.pool.query<InvoiceRecord>(
      `SELECT id, tenant_id, subscription_id, amount_usd, currency, status, period_start, period_end, line_items, issued_at, created_at
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    const invoice = result.rows[0];
    if (!invoice) {
      throw notFound('Invoice');
    }
    assertTenantAccess(principal, invoice.tenant_id);
    return invoice;
  }
}

export function toSubscriptionResponse(subscription: SubscriptionRecord) {
  return {
    id: subscription.id,
    tenantId: subscription.tenant_id,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start.toISOString(),
    currentPeriodEnd: subscription.current_period_end.toISOString(),
    createdAt: subscription.created_at.toISOString(),
    updatedAt: subscription.updated_at.toISOString(),
  };
}

export function toUsageResponse(usage: UsageRecord) {
  return {
    id: usage.id,
    tenantId: usage.tenant_id,
    meter: usage.meter,
    quantity: Number(usage.quantity),
    unitCostUsd: Number(usage.unit_cost_usd),
    modelProvider: usage.model_provider,
    modelName: usage.model_name,
    idempotencyKey: usage.idempotency_key,
    recordedAt: usage.recorded_at.toISOString(),
  };
}

export function toInvoiceResponse(invoice: InvoiceRecord) {
  return {
    id: invoice.id,
    tenantId: invoice.tenant_id,
    subscriptionId: invoice.subscription_id,
    amountUsd: Number(invoice.amount_usd),
    currency: invoice.currency,
    status: invoice.status,
    periodStart: invoice.period_start.toISOString(),
    periodEnd: invoice.period_end.toISOString(),
    lineItems: invoice.line_items,
    issuedAt: invoice.issued_at.toISOString(),
    createdAt: invoice.created_at.toISOString(),
  };
}

export function calculateUsageAmount(
  meter: UsageRecord['meter'],
  quantity: number,
  plan: SubscriptionRecord['plan'],
): number {
  return quantity * (PLAN_RATES[plan][meter] ?? 0);
}
