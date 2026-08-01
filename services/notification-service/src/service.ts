import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { notFound } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';

export interface NotificationRecord {
  id: string;
  tenant_id: string;
  channel: 'email' | 'webhook';
  destination: string;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  last_error: string | null;
  scheduled_at: Date;
  sent_at: Date | null;
  created_at: Date;
}

export interface QueueNotificationInput {
  tenantId: string;
  channel: 'email' | 'webhook';
  destination: string;
  subject?: string;
  body: string;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
}

export class NotificationService {
  constructor(private readonly pool: Pool) {}

  async queue(principal: Principal, input: QueueNotificationInput): Promise<NotificationRecord> {
    assertTenantAccess(principal, input.tenantId);

    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<NotificationRecord>(
        `INSERT INTO notifications (tenant_id, channel, destination, subject, body, payload, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, NOW()))
         RETURNING id, tenant_id, channel, destination, subject, body, payload, status, attempts, last_error, scheduled_at, sent_at, created_at`,
        [
          input.tenantId,
          input.channel,
          input.destination,
          input.subject ?? null,
          input.body,
          JSON.stringify(input.payload ?? {}),
          input.scheduledAt ?? null,
        ],
      );
      const notification = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.NotificationQueued,
        source: 'notification-service',
        tenantId: input.tenantId,
        aggregateId: notification.id,
        aggregateType: 'notification',
        sequence: 1,
        data: {
          notificationId: notification.id,
          channel: notification.channel,
          destination: notification.destination,
          subject: notification.subject,
        },
      });
      await insertOutboxEvent(client, event, topicFor('notification'));
      return notification;
    });
  }

  async getById(principal: Principal, notificationId: string): Promise<NotificationRecord> {
    const result = await this.pool.query<NotificationRecord>(
      `SELECT id, tenant_id, channel, destination, subject, body, payload, status, attempts, last_error, scheduled_at, sent_at, created_at
       FROM notifications WHERE id = $1`,
      [notificationId],
    );
    const notification = result.rows[0];
    if (!notification) {
      throw notFound('Notification');
    }
    assertTenantAccess(principal, notification.tenant_id);
    return notification;
  }

  async list(
    principal: Principal,
    tenantId: string,
    status: NotificationRecord['status'] | undefined,
    limit: number,
  ): Promise<NotificationRecord[]> {
    assertTenantAccess(principal, tenantId);

    const params: unknown[] = [tenantId];
    let statusClause = '';
    if (status) {
      params.push(status);
      statusClause = `AND status = $${params.length}`;
    }
    params.push(limit);

    const result = await this.pool.query<NotificationRecord>(
      `SELECT id, tenant_id, channel, destination, subject, body, payload, status, attempts, last_error, scheduled_at, sent_at, created_at
       FROM notifications
       WHERE tenant_id = $1 ${statusClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  async markSent(notificationId: string): Promise<NotificationRecord> {
    const result = await this.pool.query<NotificationRecord>(
      `UPDATE notifications
       SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, last_error = NULL
       WHERE id = $1 AND status IN ('queued', 'processing', 'failed')
       RETURNING id, tenant_id, channel, destination, subject, body, payload, status, attempts, last_error, scheduled_at, sent_at, created_at`,
      [notificationId],
    );
    const notification = result.rows[0];
    if (!notification) {
      throw notFound('Notification');
    }
    return notification;
  }

  async markFailed(notificationId: string, errorMessage: string): Promise<NotificationRecord> {
    const result = await this.pool.query<NotificationRecord>(
      `UPDATE notifications
       SET status = 'failed', attempts = attempts + 1, last_error = $2
       WHERE id = $1
       RETURNING id, tenant_id, channel, destination, subject, body, payload, status, attempts, last_error, scheduled_at, sent_at, created_at`,
      [notificationId, errorMessage.slice(0, 2000)],
    );
    const notification = result.rows[0];
    if (!notification) {
      throw notFound('Notification');
    }
    return notification;
  }
}

export function toNotificationResponse(notification: NotificationRecord) {
  return {
    id: notification.id,
    tenantId: notification.tenant_id,
    channel: notification.channel,
    destination: notification.destination,
    subject: notification.subject,
    body: notification.body,
    payload: notification.payload,
    status: notification.status,
    attempts: notification.attempts,
    lastError: notification.last_error,
    scheduledAt: notification.scheduled_at.toISOString(),
    sentAt: notification.sent_at?.toISOString() ?? null,
    createdAt: notification.created_at.toISOString(),
  };
}

export function isWebhookDestination(destination: string): boolean {
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
