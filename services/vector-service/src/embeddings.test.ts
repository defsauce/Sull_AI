import { describe, expect, it } from 'vitest';
import { cosineSimilarity, hashEmbedding } from './embeddings.js';

describe('hashEmbedding', () => {
  it('returns normalized vectors of requested size', () => {
    const vector = hashEmbedding('hello world', 384);
    expect(vector).toHaveLength(384);
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('is deterministic for the same input', () => {
    const left = hashEmbedding('enterprise search', 128);
    const right = hashEmbedding('enterprise search', 128);
    expect(left).toEqual(right);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vector = hashEmbedding('similar text', 64);
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('returns higher score for related text than unrelated text', () => {
    const query = hashEmbedding('machine learning models', 128);
    const related = hashEmbedding('machine learning training', 128);
    const unrelated = hashEmbedding('vegetable soup recipe', 128);
    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });
});
