import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import type { CloudEvent } from '@sull/events';

export function createPool(connectionString: string, config: Omit<PoolConfig, 'connectionString'> = {}): Pool {
  return new Pool({
    connectionString,
    max: config.max ?? 20,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    statement_timeout: config.statement_timeout ?? 30_000,
    ...config,
  });
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queryOne<T extends QueryResultRow>(
  client: Pool | PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await client.query<T>(sql, params);
  return result.rows[0] ?? null;
}

export async function queryMany<T extends QueryResultRow>(
  client: Pool | PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON outbox_events (created_at)
  WHERE published_at IS NULL;
`;

export async function ensureOutboxSchema(pool: Pool): Promise<void> {
  await pool.query(OUTBOX_DDL);
}

export async function insertOutboxEvent(
  client: PoolClient,
  event: CloudEvent,
  topic: string,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (id, topic, partition_key, payload, headers)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [
      event.id,
      topic,
      event.aggregateid,
      JSON.stringify(event),
      JSON.stringify({
        'ce-id': event.id,
        'ce-type': event.type,
        'ce-source': event.source,
        'ce-tenantid': event.tenantid,
      }),
    ],
  );
}

export interface OutboxRow {
  id: string;
  topic: string;
  partition_key: string;
  payload: CloudEvent;
  headers: Record<string, string>;
  attempts: number;
}

export async function claimOutboxBatch(
  client: PoolClient,
  limit = 100,
): Promise<OutboxRow[]> {
  const result = await client.query<OutboxRow>(
    `WITH cte AS (
       SELECT id
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE outbox_events o
     SET attempts = o.attempts + 1
     FROM cte
     WHERE o.id = cte.id
     RETURNING o.id, o.topic, o.partition_key, o.payload, o.headers, o.attempts`,
    [limit],
  );
  return result.rows;
}

export async function markOutboxPublished(client: PoolClient, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await client.query(
    `UPDATE outbox_events
     SET published_at = NOW(), last_error = NULL
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

export async function markOutboxFailed(
  client: PoolClient,
  id: string,
  errorMessage: string,
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
     SET last_error = $2
     WHERE id = $1`,
    [id, errorMessage.slice(0, 2000)],
  );
}

export const IDEMPOTENCY_DDL = `
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);
`;

export async function ensureIdempotencySchema(pool: Pool): Promise<void> {
  await pool.query(IDEMPOTENCY_DDL);
}
