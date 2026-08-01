import { describe, expect, it } from 'vitest';
import { summarizeAggregates, type DailyUsageAggregate } from './service.js';

describe('summarizeAggregates', () => {
  it('totals quantity, cost, and events', () => {
    const aggregates: DailyUsageAggregate[] = [
      {
        usageDate: '2026-08-01',
        meter: 'tokens',
        totalQuantity: 1000,
        totalCostUsd: 2,
        eventCount: 3,
        modelProvider: 'openai',
        modelName: 'gpt-4',
      },
      {
        usageDate: '2026-08-01',
        meter: 'requests',
        totalQuantity: 10,
        totalCostUsd: 0.5,
        eventCount: 10,
        modelProvider: null,
        modelName: null,
      },
    ];

    expect(summarizeAggregates(aggregates)).toEqual({
      totalQuantity: 1010,
      totalCostUsd: 2.5,
      totalEvents: 13,
    });
  });
});
