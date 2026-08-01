import type { Pool } from 'pg';
import { conflict, notFound, validation } from '@sull/errors';
import { queryMany, queryOne } from '@sull/db';
import { cosineSimilarity, type EmbeddingClient } from './embeddings.js';

export interface CollectionRecord {
  id: string;
  tenant_id: string;
  name: string;
  dimensions: number;
  created_at: Date;
}

export interface PointRecord {
  id: string;
  collection_id: string;
  external_id: string;
  embedding: number[];
  payload: Record<string, unknown>;
}

export interface SearchHit {
  id: string;
  externalId: string;
  score: number;
  payload: Record<string, unknown>;
}

export class VectorStore {
  private readonly memory = new Map<string, PointRecord[]>();

  constructor(
    private readonly pool: Pool,
    private readonly embeddings: EmbeddingClient,
  ) {}

  async createCollection(
    tenantId: string,
    name: string,
    dimensions: number,
  ): Promise<CollectionRecord> {
    const existing = await queryOne<CollectionRecord>(
      this.pool,
      `SELECT id, tenant_id, name, dimensions, created_at
       FROM vector_collections
       WHERE tenant_id = $1 AND name = $2`,
      [tenantId, name],
    );
    if (existing) {
      throw conflict(`Collection '${name}' already exists for tenant`);
    }

    const inserted = await queryOne<CollectionRecord>(
      this.pool,
      `INSERT INTO vector_collections (tenant_id, name, dimensions)
       VALUES ($1, $2, $3)
       RETURNING id, tenant_id, name, dimensions, created_at`,
      [tenantId, name, dimensions],
    );
    if (!inserted) {
      throw validation('Failed to create collection');
    }

    this.memory.set(inserted.id, []);
    return inserted;
  }

  async getCollection(collectionId: string, tenantId?: string): Promise<CollectionRecord> {
    const params: unknown[] = [collectionId];
    let sql = `SELECT id, tenant_id, name, dimensions, created_at
               FROM vector_collections
               WHERE id = $1`;
    if (tenantId) {
      sql += ` AND tenant_id = $2`;
      params.push(tenantId);
    }

    const collection = await queryOne<CollectionRecord>(this.pool, sql, params);
    if (!collection) {
      throw notFound('Collection');
    }
    return collection;
  }

  async upsertPoints(
    collectionId: string,
    tenantId: string,
    points: Array<{ externalId: string; text?: string; embedding?: number[]; payload?: Record<string, unknown> }>,
  ): Promise<{ upserted: number }> {
    const collection = await this.getCollection(collectionId, tenantId);
    const textsToEmbed = points.filter((point) => !point.embedding && point.text);
    const embedded =
      textsToEmbed.length > 0
        ? await this.embeddings.embed(textsToEmbed.map((point) => point.text!))
        : [];

    let embedIndex = 0;
    const normalized = points.map((point) => {
      let embedding = point.embedding;
      if (!embedding) {
        if (!point.text) {
          throw validation('Point requires text or embedding');
        }
        embedding = embedded[embedIndex]!;
        embedIndex += 1;
      }
      if (embedding.length !== collection.dimensions) {
        throw validation(`Embedding dimension mismatch: expected ${collection.dimensions}`);
      }
      return {
        externalId: point.externalId,
        embedding,
        payload: point.payload ?? {},
      };
    });

    for (const point of normalized) {
      await this.pool.query(
        `INSERT INTO vector_points (collection_id, external_id, embedding, payload)
         VALUES ($1, $2, $3::real[], $4::jsonb)
         ON CONFLICT (collection_id, external_id)
         DO UPDATE SET embedding = EXCLUDED.embedding,
                       payload = EXCLUDED.payload,
                       updated_at = NOW()`,
        [collectionId, point.externalId, point.embedding, JSON.stringify(point.payload)],
      );
    }

    const rows = await queryMany<{
      id: string;
      collection_id: string;
      external_id: string;
      embedding: number[];
      payload: Record<string, unknown>;
    }>(
      this.pool,
      `SELECT id, collection_id, external_id, embedding, payload
       FROM vector_points
       WHERE collection_id = $1`,
      [collectionId],
    );

    this.memory.set(
      collectionId,
      rows.map((row) => ({
        id: row.id,
        collection_id: row.collection_id,
        external_id: row.external_id,
        embedding: row.embedding,
        payload: row.payload,
      })),
    );

    return { upserted: normalized.length };
  }

  async search(
    collectionId: string,
    tenantId: string,
    query: { text?: string; embedding?: number[]; topK: number },
  ): Promise<SearchHit[]> {
    const collection = await this.getCollection(collectionId, tenantId);
    let queryEmbedding = query.embedding;
    if (!queryEmbedding) {
      if (!query.text) {
        throw validation('Search requires text or embedding');
      }
      queryEmbedding = (await this.embeddings.embed([query.text]))[0]!;
    }
    if (queryEmbedding.length !== collection.dimensions) {
      throw validation(`Query embedding dimension mismatch: expected ${collection.dimensions}`);
    }

    const points = this.memory.get(collectionId);
    if (!points) {
      const rows = await queryMany<{
        id: string;
        collection_id: string;
        external_id: string;
        embedding: number[];
        payload: Record<string, unknown>;
      }>(
        this.pool,
        `SELECT id, collection_id, external_id, embedding, payload
         FROM vector_points
         WHERE collection_id = $1`,
        [collectionId],
      );
      this.memory.set(
        collectionId,
        rows.map((row) => ({
          id: row.id,
          collection_id: row.collection_id,
          external_id: row.external_id,
          embedding: row.embedding,
          payload: row.payload,
        })),
      );
    }

    const cached = this.memory.get(collectionId) ?? [];
    return cached
      .map((point) => ({
        id: point.id,
        externalId: point.external_id,
        score: cosineSimilarity(queryEmbedding!, point.embedding),
        payload: point.payload,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, query.topK);
  }
}
