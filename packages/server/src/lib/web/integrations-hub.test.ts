import { describe, expect, it } from 'vitest';
import { toAccountView } from './integrations-hub';

describe('toAccountView', () => {
  it('keeps what the hub displays and drops every token', () => {
    const view = toAccountView({
      displayName: 'A',
      email: 'a@b.c',
      lastSyncAt: new Date(0),
      accessTokenEnc: 'secret',
      refreshTokenEnc: 'secret',
      passwordEnc: 'secret',
      sessionTokenEnc: 'secret',
      apiKeyEnc: 'secret',
    });
    expect(view).toEqual({ displayName: 'A', email: 'a@b.c', lastSyncAt: new Date(0) });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('is null without an account', () => {
    expect(toAccountView(null)).toBeNull();
  });
});
