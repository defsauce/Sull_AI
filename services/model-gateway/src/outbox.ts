import type { Pool } from 'pg';
import type { Producer } from 'kafkajs';
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxPublished,
  withTransaction,
} from '@sull/db';
import { publishCloudEvent } from '@sull/kafka';
import type { Logger } from '@sull/logger';
import type { CloudEvent } from '@sull/events';

export function startOutboxRelay(options: {
  pool: Pool;
  producer: Producer;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  const intervalMs = options.intervalMs ?? 1000;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    try {
      await withTransaction(options.pool, async (client) => {
        const batch = await claimOutboxBatch(client, 50);
        const published: string[] = [];
        for (const row of batch) {
          try {
            await publishCloudEvent(
              options.producer,
              row.topic,
              row.payload as CloudEvent,
              row.partition_key,
            );
            published.push(row.id);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'publish failed';
            await markOutboxFailed(client, row.id, message);
            options.logger.error({ err: error, outboxId: row.id }, 'Outbox publish failed');
          }
        }
        await markOutboxPublished(client, published);
      });
    } catch (error) {
      options.logger.error({ err: error }, 'Outbox relay tick failed');
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
