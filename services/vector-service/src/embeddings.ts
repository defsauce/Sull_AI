import { createHash } from 'node:crypto';
import { dependencyFailed } from '@sull/errors';

export function hashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase().trim();
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);

  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest();
    for (let index = 0; index < dimensions; index += 1) {
      const byte = digest[index % digest.length]!;
      const sign = byte % 2 === 0 ? 1 : -1;
      vector[index]! += sign * (byte / 255);
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denominator === 0) {
    return 0;
  }
  return dot / denominator;
}

export interface EmbeddingClientOptions {
  readonly apiKey?: string | undefined;
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
}

export class EmbeddingClient {
  constructor(private readonly options: EmbeddingClientOptions) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (!this.options.apiKey) {
      return texts.map((text) => hashEmbedding(text, this.options.dimensions));
    }

    const response = await fetch(`${this.options.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        input: texts,
        dimensions: this.options.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw dependencyFailed(`Embedding provider returned ${response.status}`, body);
    }

    const payload = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return payload.data.map((item) => item.embedding);
  }
}
