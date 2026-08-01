import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { RagIngest, RagQuery } from '@sull/contracts';
import { queryMany } from '@sull/db';
import { notFound } from '@sull/errors';
import { chunkByParagraphs, lexicalScore } from './chunker.js';
import type { VectorClient } from './vector-client.js';

export interface RagChunkRecord {
  id: string;
  document_id: string;
  tenant_id: string;
  collection_id: string;
  chunk_index: number;
  content: string;
}

export interface RagQueryHit {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  lexicalScore: number;
  vectorScore: number;
}

export class RagService {
  constructor(
    private readonly pool: Pool,
    private readonly vectorClient: VectorClient,
    private readonly defaultTenantId: string,
  ) {}

  async ingest(tenantId: string, input: RagIngest): Promise<{ documentId: string; chunks: number }> {
    const documentId = input.documentId ?? randomUUID();
    const chunks = chunkByParagraphs(input.content);

    await this.pool.query(
      `INSERT INTO rag_documents (id, tenant_id, collection_id, title, content_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           content_type = EXCLUDED.content_type,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
      [
        documentId,
        tenantId,
        input.collectionId,
        input.title,
        input.contentType,
        JSON.stringify(input.metadata),
      ],
    );

    await this.pool.query(`DELETE FROM rag_chunks WHERE document_id = $1`, [documentId]);

    for (const chunk of chunks) {
      await this.pool.query(
        `INSERT INTO rag_chunks
         (document_id, tenant_id, collection_id, chunk_index, content, token_estimate)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [documentId, tenantId, input.collectionId, chunk.index, chunk.content, chunk.tokenEstimate],
      );
    }

    await this.vectorClient.upsert(
      input.collectionId,
      tenantId,
      chunks.map((chunk) => ({
        externalId: `${documentId}:${chunk.index}`,
        text: chunk.content,
        payload: {
          documentId,
          chunkIndex: chunk.index,
          title: input.title,
        },
      })),
    );

    return { documentId, chunks: chunks.length };
  }

  async query(tenantId: string, input: RagQuery): Promise<{ hits: RagQueryHit[] }> {
    const lexicalCandidates = await queryMany<RagChunkRecord>(
      this.pool,
      `SELECT id, document_id, tenant_id, collection_id, chunk_index, content
       FROM rag_chunks
       WHERE tenant_id = $1 AND collection_id = $2`,
      [tenantId, input.collectionId],
    );

    const vectorHits = await this.vectorClient.search(
      input.collectionId,
      tenantId,
      input.query,
      input.topK * 2,
    );
    const vectorByExternal = new Map(vectorHits.map((hit) => [hit.externalId, hit.score]));

    const hits = lexicalCandidates
      .map((chunk) => {
        const externalId = `${chunk.document_id}:${chunk.chunk_index}`;
        const vectorScore = vectorByExternal.get(externalId) ?? 0;
        const lexical = lexicalScore(input.query, chunk.content);
        const score = vectorScore * 0.7 + lexical * 0.3;
        return {
          chunkId: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content,
          score,
          lexicalScore: lexical,
          vectorScore,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, input.topK);

    if (hits.length === 0) {
      throw notFound('RAG results');
    }

    return { hits };
  }

  getDefaultTenantId(): string {
    return this.defaultTenantId;
  }
}
