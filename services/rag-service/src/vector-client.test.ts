import { describe, expect, it } from 'vitest';
import { LocalVectorClient } from './vector-client.js';

describe('LocalVectorClient', () => {
  it('stores and retrieves vectors by semantic hash similarity', async () => {
    const client = new LocalVectorClient(128);
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const collectionId = '22222222-2222-4222-8222-222222222222';

    await client.upsert(collectionId, tenantId, [
      { externalId: 'a', text: 'machine learning training pipeline' },
      { externalId: 'b', text: 'vegetable soup recipe' },
    ]);

    const hits = await client.search(collectionId, tenantId, 'machine learning models', 2);
    expect(hits[0]?.externalId).toBe('a');
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });
});
