import type { Pool } from 'pg';
import { queryMany } from '@sull/db';
import type { RecordUsageInput, UsageAggregateQuery } from './config.js';

export interface DailyUsageAggregate {
  usageDate: string;
  meter: string;
  totalQuantity: number;
  totalCostUsd: number;
  eventCount: number;
  modelProvider: string | null;
  modelName: string | null;
}

export class AnalyticsService {
  constructor(private readonly pool: Pool) {}

  async recordUsage(input: RecordUsageInput): Promise<{ recorded: true; costUsd: number }> {
    const usageDate = (input.recordedAt ?? new Date().toISOString()).slice(0, 10);
    const costUsd = input.quantity * input.unitCostUsd;

    await this.pool.query(
      `INSERT INTO daily_usage
       (tenant_id, usage_date, meter, quantity, cost_usd, model_provider, model_name, event_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       ON CONFLICT (tenant_id, usage_date, meter, model_provider, model_name)
       DO UPDATE SET
         quantity = daily_usage.quantity + EXCLUDED.quantity,
         cost_usd = daily_usage.cost_usd + EXCLUDED.cost_usd,
         event_count = daily_usage.event_count + 1,
         updated_at = NOW()`,
      [
        input.tenantId,
        usageDate,
        input.meter,
        input.quantity,
        costUsd,
        input.modelProvider ?? null,
        input.modelName ?? null,
      ],
    );

    return { recorded: true, costUsd };
  }

  async queryAggregates(query: UsageAggregateQuery): Promise<{ aggregates: DailyUsageAggregate[] }> {
    const params: unknown[] = [query.tenantId, query.from, query.to];
    let sql = `
      SELECT usage_date, meter,
             SUM(quantity)::float AS total_quantity,
             SUM(cost_usd)::float AS total_cost_usd,
             SUM(event_count)::int AS event_count,
             model_provider, model_name
      FROM daily_usage
      WHERE tenant_id = $1
        AND usage_date >= $2
        AND usage_date <= $3`;

    if (query.meter) {
      params.push(query.meter);
      sql += ` AND meter = $${params.length}`;
    }

    sql += `
      GROUP BY usage_date, meter, model_provider, model_name
      ORDER BY usage_date ASC, meter ASC`;

    const rows = await queryMany<{
      usage_date: Date;
      meter: string;
      total_quantity: number;
      total_cost_usd: number;
      event_count: number;
      model_provider: string | null;
      model_name: string | null;
    }>(this.pool, sql, params);

    return {
      aggregates: rows.map((row) => ({
        usageDate: row.usage_date.toISOString().slice(0, 10),
        meter: row.meter,
        totalQuantity: row.total_quantity,
        totalCostUsd: row.total_cost_usd,
        eventCount: row.event_count,
        modelProvider: row.model_provider,
        modelName: row.model_name,
      })),
    };
  }
}

export function summarizeAggregates(aggregates: DailyUsageAggregate[]) {
  return aggregates.reduce(
    (summary, item) => {
      summary.totalQuantity += item.totalQuantity;
      summary.totalCostUsd += item.totalCostUsd;
      summary.totalEvents += item.eventCount;
      return summary;
    },
    { totalQuantity: 0, totalCostUsd: 0, totalEvents: 0 },
  );
}
