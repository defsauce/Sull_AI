import { describe, expect, it } from 'vitest';
import { chunkByParagraphs, lexicalScore } from './chunker.js';

describe('chunkByParagraphs', () => {
  it('splits content into paragraph-aware chunks near 500 characters', () => {
    const paragraph = 'word '.repeat(120).trim();
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const chunks = chunkByParagraphs(content, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 520)).toBe(true);
  });
});

describe('lexicalScore', () => {
  it('scores overlapping terms higher', () => {
    const score = lexicalScore('enterprise search platform', 'The enterprise search platform indexes documents');
    expect(score).toBeGreaterThan(0.5);
  });
});
