import { describe, expect, it } from 'vitest';
import { buildSnippet } from './service.js';

describe('buildSnippet', () => {
  it('centers snippet around matched query terms', () => {
    const body =
      'Prefix text that should be skipped. Enterprise search indexes documents for fast retrieval across tenants.';
    const snippet = buildSnippet(body, 'enterprise search');
    expect(snippet.toLowerCase()).toContain('enterprise search');
  });

  it('falls back to prefix when no terms match', () => {
    const snippet = buildSnippet('Hello world from search service', 'zzz');
    expect(snippet.startsWith('Hello world')).toBe(true);
  });
});
