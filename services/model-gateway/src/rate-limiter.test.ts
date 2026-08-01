import { describe, expect, it, vi } from 'vitest';
import { TenantRateLimiter } from './rate-limiter.js';

function createRedisMock(initial: Record<string, Record<string, string>> = {}) {
  const store = new Map<string, Record<string, string>>(
    Object.entries(initial).map(([key, value]) => [key, { ...value }]),
  );

  return {
    hgetall: vi.fn(async (key: string) => store.get(key) ?? {}),
    hset: vi.fn(async (key: string, values: Record<string, string>) => {
      store.set(key, { ...(store.get(key) ?? {}), ...values });
      return 1;
    }),
    hincrby: vi.fn(async (key: string, field: string, increment: number) => {
      const record = store.get(key) ?? {};
      const next = Number(record[field] ?? 0) + increment;
      record[field] = String(next);
      store.set(key, record);
      return next;
    }),
    hincrbyfloat: vi.fn(async (key: string, field: string, increment: number) => {
      const record = store.get(key) ?? {};
      const next = Number(record[field] ?? 0) + increment;
      record[field] = String(next);
      store.set(key, record);
      return next;
    }),
    multi: vi.fn(() => {
      const commands: Array<() => Promise<[null, number | string]>> = [];
      return {
        hincrby: (key: string, field: string, increment: number) => {
          commands.push(async () => [null, await redis.hincrby(key, field, increment)]);
          return redis.multi();
        },
        hincrbyfloat: (key: string, field: string, increment: number) => {
          commands.push(async () => [null, await redis.hincrbyfloat(key, field, increment)]);
          return redis.multi();
        },
        expire: () => redis.multi(),
        exec: async () => {
          const results: Array<[null, number | string]> = [];
          for (const command of commands) {
            results.push(await command());
          }
          return results;
        },
      };
    }),
  } as const;
}

const redis = createRedisMock();

describe('TenantRateLimiter', () => {
  it('tracks daily token and spend usage', async () => {
    const limiter = new TenantRateLimiter(redis as never, {
      maxTokensPerDay: 1000,
      maxSpendUsdPerDay: 10,
    });

    await limiter.recordUsage('tenant-1', 100, 1.5);
    await limiter.recordUsage('tenant-1', 50, 0.5);

    const usage = await limiter.getUsage('tenant-1');
    expect(usage.tokensUsed).toBe(150);
    expect(usage.spendUsd).toBe(2);
  });

  it('rejects usage above configured caps', async () => {
    const limiter = new TenantRateLimiter(redis as never, {
      maxTokensPerDay: 200,
      maxSpendUsdPerDay: 1,
    });

    await expect(limiter.assertWithinCaps('tenant-2', 250, 0.1)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });
});
