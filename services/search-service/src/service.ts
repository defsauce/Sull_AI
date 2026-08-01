import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { queryMany } from '@sull/db';
import type { IndexDocumentInput, SearchQueryInput } from './config.js';

export interface SearchHit {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
  metadata: Record<string, unknown>;
}

export class SearchService {
  constructor(private readonly pool: Pool) {}

  async indexDocument(input: IndexDocumentInput): Promise<{ documentId: string }> {
    const documentId = input.documentId ?? randomUUID();
    const combinedText = `${input.title}\n${input.body}`;

    await this.pool.query(
      `INSERT INTO search_documents (id, tenant_id, title, body, metadata, search_vector)
       VALUES ($1, $2, $3, $4, $5::jsonb, to_tsvector('english', $6))
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           body = EXCLUDED.body,
           metadata = EXCLUDED.metadata,
           search_vector = EXCLUDED.search_vector,
           updated_at = NOW()`,
      [
        documentId,
        input.tenantId,
        input.title,
        input.body,
        JSON.stringify(input.metadata),
        combinedText,
      ],
    );

    return { documentId };
  }

  async search(input: SearchQueryInput): Promise<{ hits: SearchHit[] }> {
    const rows = await queryMany<{
      id: string;
      title: string;
      body: string;
      metadata: Record<string, unknown>;
      rank: number;
    }>(
      this.pool,
      `SELECT id, title, body, metadata,
              ts_rank(search_vector, websearch_to_tsquery('english', $2)) AS rank
       FROM search_documents
       WHERE tenant_id = $1
         AND search_vector @@ websearch_to_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT $3`,
      [input.tenantId, input.q, input.limit],
    );

    return {
      hits: rows.map((row) => ({
        documentId: row.id,
        title: row.title,
        snippet: buildSnippet(row.body, input.q),
        rank: row.rank,
        metadata: row.metadata,
      })),
    };
  }
}

export function buildSnippet(body: string, query: string, maxLength = 180): string {
  const lowerBody = body.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  let index = -1;
  for (const term of terms) {
    const found = lowerBody.indexOf(term);
    if (found >= 0) {
      index = found;
      break;
    }
  }
  if (index < 0) {
    return body.slice(0, maxLength);
  }
  const start = Math.max(0, index - 40);
  return body.slice(start, start + maxLength).trim();
}
