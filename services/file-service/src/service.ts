import { createHash, randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { conflict, notFound } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';
import type { FileEnv } from './config.js';

export interface FileRecord {
  id: string;
  tenant_id: string;
  bucket: string;
  object_key: string;
  filename: string;
  content_type: string;
  size_bytes: string;
  checksum_sha256: string | null;
  status: 'pending' | 'uploaded' | 'deleted';
  uploaded_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUploadUrlInput {
  tenantId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface CompleteUploadInput {
  checksumSha256?: string;
}

export class FileService {
  private readonly s3: S3Client;

  constructor(
    private readonly pool: Pool,
    private readonly env: FileEnv,
  ) {
    this.s3 = new S3Client({
      region: env.AWS_S3_REGION,
      credentials: {
        accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY,
      },
      ...(env.AWS_S3_ENDPOINT
        ? {
            endpoint: env.AWS_S3_ENDPOINT,
            forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
          }
        : {}),
    });
  }

  private buildObjectKey(tenantId: string, filename: string): string {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
    return `${tenantId}/${randomUUID()}/${safeName}`;
  }

  async createUploadUrl(
    principal: Principal,
    input: CreateUploadUrlInput,
  ): Promise<{ file: FileRecord; uploadUrl: string; expiresInSec: number }> {
    assertTenantAccess(principal, input.tenantId);
    const objectKey = this.buildObjectKey(input.tenantId, input.filename);

    const file = await withTransaction(this.pool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM files WHERE tenant_id = $1 AND object_key = $2 AND status <> 'deleted'`,
        [input.tenantId, objectKey],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict('File object key collision, retry upload');
      }

      const inserted = await client.query<FileRecord>(
        `INSERT INTO files (tenant_id, bucket, object_key, filename, content_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tenant_id, bucket, object_key, filename, content_type, size_bytes, checksum_sha256, status, uploaded_by, created_at, updated_at`,
        [
          input.tenantId,
          this.env.AWS_S3_BUCKET,
          objectKey,
          input.filename,
          input.contentType,
          input.sizeBytes,
          principal.sub,
        ],
      );
      return inserted.rows[0]!;
    });

    const command = new PutObjectCommand({
      Bucket: this.env.AWS_S3_BUCKET,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.env.AWS_S3_SIGNED_URL_TTL_SEC,
    });

    return {
      file,
      uploadUrl,
      expiresInSec: this.env.AWS_S3_SIGNED_URL_TTL_SEC,
    };
  }

  async completeUpload(
    principal: Principal,
    fileId: string,
    input: CompleteUploadInput,
  ): Promise<FileRecord> {
    return withTransaction(this.pool, async (client) => {
      const current = await client.query<FileRecord>(
        `SELECT id, tenant_id, bucket, object_key, filename, content_type, size_bytes, checksum_sha256, status, uploaded_by, created_at, updated_at
         FROM files WHERE id = $1 AND status = 'pending'`,
        [fileId],
      );
      const pending = current.rows[0];
      if (!pending) {
        throw notFound('Pending file');
      }
      assertTenantAccess(principal, pending.tenant_id);

      const checksum = input.checksumSha256 ?? createHash('sha256').update(pending.object_key).digest('hex');
      const updated = await client.query<FileRecord>(
        `UPDATE files
         SET status = 'uploaded', checksum_sha256 = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, tenant_id, bucket, object_key, filename, content_type, size_bytes, checksum_sha256, status, uploaded_by, created_at, updated_at`,
        [fileId, checksum],
      );
      const file = updated.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.FileUploaded,
        source: 'file-service',
        tenantId: file.tenant_id,
        aggregateId: file.id,
        aggregateType: 'file',
        sequence: Number(Date.now()),
        data: {
          fileId: file.id,
          tenantId: file.tenant_id,
          filename: file.filename,
          contentType: file.content_type,
          sizeBytes: Number(file.size_bytes),
          objectKey: file.object_key,
          checksumSha256: file.checksum_sha256,
        },
      });
      await insertOutboxEvent(client, event, topicFor('file'));
      return file;
    });
  }

  async getById(principal: Principal, fileId: string): Promise<FileRecord> {
    const result = await this.pool.query<FileRecord>(
      `SELECT id, tenant_id, bucket, object_key, filename, content_type, size_bytes, checksum_sha256, status, uploaded_by, created_at, updated_at
       FROM files WHERE id = $1 AND status <> 'deleted'`,
      [fileId],
    );
    const file = result.rows[0];
    if (!file) {
      throw notFound('File');
    }
    assertTenantAccess(principal, file.tenant_id);
    return file;
  }

  async createDownloadUrl(
    principal: Principal,
    fileId: string,
  ): Promise<{ downloadUrl: string; expiresInSec: number }> {
    const file = await this.getById(principal, fileId);
    if (file.status !== 'uploaded') {
      throw notFound('Uploaded file');
    }

    const command = new GetObjectCommand({
      Bucket: file.bucket,
      Key: file.object_key,
    });
    const downloadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.env.AWS_S3_SIGNED_URL_TTL_SEC,
    });

    return {
      downloadUrl,
      expiresInSec: this.env.AWS_S3_SIGNED_URL_TTL_SEC,
    };
  }

  async list(principal: Principal, tenantId: string, limit: number): Promise<FileRecord[]> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<FileRecord>(
      `SELECT id, tenant_id, bucket, object_key, filename, content_type, size_bytes, checksum_sha256, status, uploaded_by, created_at, updated_at
       FROM files
       WHERE tenant_id = $1 AND status <> 'deleted'
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    return result.rows;
  }
}

export function toFileResponse(file: FileRecord) {
  return {
    id: file.id,
    tenantId: file.tenant_id,
    bucket: file.bucket,
    objectKey: file.object_key,
    filename: file.filename,
    contentType: file.content_type,
    sizeBytes: Number(file.size_bytes),
    checksumSha256: file.checksum_sha256,
    status: file.status,
    uploadedBy: file.uploaded_by,
    createdAt: file.created_at.toISOString(),
    updatedAt: file.updated_at.toISOString(),
  };
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}
