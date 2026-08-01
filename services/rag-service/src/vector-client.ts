import { dependencyFailed } from '@sull/errors';
import { cosineSimilarity, hashEmbedding } from './embeddings.js';

export interface VectorPointInput {
  externalId: string;
  text: string;
  payload?: Record<string, unknown>;
}

export interface VectorSearchHit {
  externalId: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorClient {
  upsert(collectionId: string, tenantId: string, points: VectorPointInput[]): Promise<void>;
  search(
    collectionId: string,
    tenantId: string,
    query: string,
    topK: number,
  ): Promise<VectorSearchHit[]>;
}

export class HttpVectorClient implements VectorClient {
  constructor(private readonly baseUrl: string) {}

  async upsert(collectionId: string, tenantId: string, points: VectorPointInput[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/collections/${collectionId}/upsert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, points }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw dependencyFailed(`Vector service upsert failed with ${response.status}`, body);
    }
  }

  async search(
    collectionId: string,
    tenantId: string,
    query: string,
    topK: number,
  ): Promise<VectorSearchHit[]> {
    const response = await fetch(`${this.baseUrl}/v1/collections/${collectionId}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, text: query, topK }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw dependencyFailed(`Vector service search failed with ${response.status}`, body);
    }
    const payload = (await response.json()) as {
      hits: Array<{ externalId: string; score: number; payload: Record<string, unknown> }>;
    };
    return payload.hits;
  }
}

export class LocalVectorClient implements VectorClient {
  private readonly store = new Map<string, Map<string, { embedding: number[]; payload: Record<string, unknown> }>>();

  constructor(private readonly dimensions: number) {}

  async upsert(collectionId: string, _tenantId: string, points: VectorPointInput[]): Promise<void> {
    const collection = this.store.get(collectionId) ?? new Map();
    for (const point of points) {
      collection.set(point.externalId, {
        embedding: hashEmbedding(point.text, this.dimensions),
        payload: point.payload ?? {},
      });
    }
    this.store.set(collectionId, collection);
  }

  async search(
    collectionId: string,
    _tenantId: string,
    query: string,
    topK: number,
  ): Promise<VectorSearchHit[]> {
    const collection = this.store.get(collectionId) ?? new Map();
    const queryEmbedding = hashEmbedding(query, this.dimensions);
    return [...collection.entries()]
      .map(([externalId, value]) => ({
        externalId,
        score: cosineSimilarity(queryEmbedding, value.embedding),
        payload: value.payload,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

export function createVectorClient(
  vectorServiceUrl: string | undefined,
  dimensions: number,
): VectorClient {
  if (vectorServiceUrl) {
    return new HttpVectorClient(vectorServiceUrl);
  }
  return new LocalVectorClient(dimensions);
}
