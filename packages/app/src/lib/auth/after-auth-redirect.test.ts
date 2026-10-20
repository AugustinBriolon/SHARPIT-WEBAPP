import { describe, expect, it } from 'vitest';
import { afterAuthPath } from '@sharpit/app/lib/auth/after-auth-redirect';

const origin = 'https://sharpit.app';

describe('afterAuthPath', () => {
  it('goes to the entry router without a redirect_url', () => {
    expect(afterAuthPath(null, origin)).toBe('/start');
  });

  it('returns into the Garmin handoff Clerk was carrying', () => {
    expect(afterAuthPath('https://sharpit.app/connect/strava', origin)).toBe('/connect/strava');
    expect(afterAuthPath('/connect/strava/start', origin)).toBe('/connect/strava/start');
  });

  it('never sends a signed-in athlete to a signed-out page', () => {
    expect(afterAuthPath('https://sharpit.app/welcome', origin)).toBe('/start');
    expect(afterAuthPath('/sign-in', origin)).toBe('/start');
    expect(afterAuthPath('/sign-up/verify', origin)).toBe('/start');
  });

  it('never opens another origin', () => {
    expect(afterAuthPath('https://evil.example/connect/strava', origin)).toBe('/start');
    expect(afterAuthPath('//evil.example/x', origin)).toBe('/start');
    expect(afterAuthPath('https://sharpit.vercel.app/', origin)).toBe('/start');
  });

  it('keeps the query of a same-origin target', () => {
    expect(afterAuthPath('/plan?week=2', origin)).toBe('/plan?week=2');
  });
});
