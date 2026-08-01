import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { conflict, forbidden, notFound, policyDenied } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';

export interface PolicyBundleRecord {
  id: string;
  tenant_id: string;
  name: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  published_at: Date | null;
  created_at: Date;
}

export interface PolicyRuleRecord {
  id: string;
  bundle_id: string;
  effect: 'allow' | 'deny';
  action_pattern: string;
  resource_pattern: string;
  condition: Record<string, unknown>;
  priority: number;
  created_at: Date;
}

export interface PolicyRuleInput {
  effect: 'allow' | 'deny';
  actionPattern: string;
  resourcePattern: string;
  condition?: Record<string, unknown>;
  priority?: number;
}

export interface PublishBundleInput {
  tenantId: string;
  name: string;
  version: number;
  rules: PolicyRuleInput[];
}

export interface EvaluateInput {
  tenantId: string;
  action: string;
  resource: string;
  context?: Record<string, unknown>;
}

export interface EvaluateResult {
  decision: 'allow' | 'deny';
  matchedRuleId: string | null;
  bundleId: string | null;
}

export class PolicyService {
  constructor(private readonly pool: Pool) {}

  async publishBundle(principal: Principal, input: PublishBundleInput): Promise<PolicyBundleRecord> {
    assertTenantAccess(principal, input.tenantId);
    if (!principal.roles.includes('platform_admin') && !principal.roles.includes('policy_admin')) {
      throw forbidden('Only policy or platform admins can publish bundles');
    }
    if (input.rules.length === 0) {
      throw conflict('Policy bundle must contain at least one rule');
    }

    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM policy_bundles WHERE tenant_id = $1 AND name = $2 AND version = $3`,
        [input.tenantId, input.name, input.version],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict(`Policy bundle '${input.name}' version ${input.version} already exists`);
      }

      await client.query(
        `UPDATE policy_bundles SET status = 'archived'
         WHERE tenant_id = $1 AND name = $2 AND status = 'published'`,
        [input.tenantId, input.name],
      );

      const inserted = await client.query<PolicyBundleRecord>(
        `INSERT INTO policy_bundles (tenant_id, name, version, status, published_at)
         VALUES ($1, $2, $3, 'published', NOW())
         RETURNING id, tenant_id, name, version, status, published_at, created_at`,
        [input.tenantId, input.name, input.version],
      );
      const bundle = inserted.rows[0]!;

      for (const rule of input.rules) {
        await client.query(
          `INSERT INTO policy_rules (bundle_id, effect, action_pattern, resource_pattern, condition, priority)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [
            bundle.id,
            rule.effect,
            rule.actionPattern,
            rule.resourcePattern,
            JSON.stringify(rule.condition ?? {}),
            rule.priority ?? 100,
          ],
        );
      }

      const event = createCloudEvent({
        type: EventTypes.PolicyBundlePublished,
        source: 'policy-service',
        tenantId: input.tenantId,
        aggregateId: bundle.id,
        aggregateType: 'policy_bundle',
        sequence: input.version,
        data: {
          bundleId: bundle.id,
          tenantId: bundle.tenant_id,
          name: bundle.name,
          version: bundle.version,
          ruleCount: input.rules.length,
        },
      });
      await insertOutboxEvent(client, event, topicFor('policy'));
      return bundle;
    });
  }

  async getBundle(principal: Principal, bundleId: string): Promise<{
    bundle: PolicyBundleRecord;
    rules: PolicyRuleRecord[];
  }> {
    const bundleResult = await this.pool.query<PolicyBundleRecord>(
      `SELECT id, tenant_id, name, version, status, published_at, created_at
       FROM policy_bundles WHERE id = $1`,
      [bundleId],
    );
    const bundle = bundleResult.rows[0];
    if (!bundle) {
      throw notFound('Policy bundle');
    }
    assertTenantAccess(principal, bundle.tenant_id);

    const rulesResult = await this.pool.query<PolicyRuleRecord>(
      `SELECT id, bundle_id, effect, action_pattern, resource_pattern, condition, priority, created_at
       FROM policy_rules WHERE bundle_id = $1 ORDER BY priority ASC, created_at ASC`,
      [bundleId],
    );

    return { bundle, rules: rulesResult.rows };
  }

  async listBundles(principal: Principal, tenantId: string): Promise<PolicyBundleRecord[]> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<PolicyBundleRecord>(
      `SELECT id, tenant_id, name, version, status, published_at, created_at
       FROM policy_bundles
       WHERE tenant_id = $1 AND status = 'published'
       ORDER BY name ASC, version DESC`,
      [tenantId],
    );
    return result.rows;
  }

  async evaluate(principal: Principal, input: EvaluateInput): Promise<EvaluateResult> {
    assertTenantAccess(principal, input.tenantId);

    const rulesResult = await this.pool.query<PolicyRuleRecord>(
      `SELECT r.id, r.bundle_id, r.effect, r.action_pattern, r.resource_pattern, r.condition, r.priority, r.created_at
       FROM policy_rules r
       INNER JOIN policy_bundles b ON b.id = r.bundle_id
       WHERE b.tenant_id = $1 AND b.status = 'published'
       ORDER BY r.priority ASC, r.created_at ASC`,
      [input.tenantId],
    );

    for (const rule of rulesResult.rows) {
      if (!matchesPattern(rule.action_pattern, input.action)) {
        continue;
      }
      if (!matchesPattern(rule.resource_pattern, input.resource)) {
        continue;
      }
      if (!matchesCondition(rule.condition, input.context ?? {})) {
        continue;
      }

      if (rule.effect === 'deny') {
        throw policyDenied(`Denied by policy rule ${rule.id}`);
      }

      return {
        decision: 'allow',
        matchedRuleId: rule.id,
        bundleId: rule.bundle_id,
      };
    }

    return {
      decision: 'deny',
      matchedRuleId: null,
      bundleId: null,
    };
  }
}

export function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}

export function matchesCondition(
  condition: Record<string, unknown>,
  context: Record<string, unknown>,
): boolean {
  const entries = Object.entries(condition);
  if (entries.length === 0) {
    return true;
  }
  return entries.every(([key, expected]) => context[key] === expected);
}

export function toBundleResponse(bundle: PolicyBundleRecord) {
  return {
    id: bundle.id,
    tenantId: bundle.tenant_id,
    name: bundle.name,
    version: bundle.version,
    status: bundle.status,
    publishedAt: bundle.published_at?.toISOString() ?? null,
    createdAt: bundle.created_at.toISOString(),
  };
}

export function toRuleResponse(rule: PolicyRuleRecord) {
  return {
    id: rule.id,
    bundleId: rule.bundle_id,
    effect: rule.effect,
    actionPattern: rule.action_pattern,
    resourcePattern: rule.resource_pattern,
    condition: rule.condition,
    priority: rule.priority,
    createdAt: rule.created_at.toISOString(),
  };
}
