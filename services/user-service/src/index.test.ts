import { describe, expect, it } from 'vitest';
import { toUserResponse, type UserProfileRecord } from './service.js';

describe('toUserResponse', () => {
  it('maps snake_case database fields to camelCase API fields', () => {
    const user: UserProfileRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'alice@example.com',
      display_name: 'Alice',
      avatar_url: 'https://cdn.example.com/alice.png',
      status: 'active',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
    };

    expect(toUserResponse(user)).toEqual({
      id: user.id,
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: 'https://cdn.example.com/alice.png',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
