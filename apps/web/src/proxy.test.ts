import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  userId: null as string | null,
  clerkError: null as Error | null,
  protect: vi.fn(),
  options: [] as unknown[],
}));

vi.mock('@clerk/nextjs/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clerk/nextjs/server')>();
  return {
    ...actual,
    clerkMiddleware: (
      handler: (auth: unknown, req: NextRequest) => Promise<Response | void>,
      options: unknown,
    ) => {
      state.options.push(options);
      return async (req: NextRequest) => {
        if (state.clerkError) {
          throw state.clerkError;
        }
        const auth = Object.assign(async () => ({ userId: state.userId }), {
          protect: state.protect,
        });
        return (await handler(auth, req)) ?? NextResponse.next();
      };
    },
  };
});

vi.mock('@sharpit/app/lib/dev/dev-auth', () => ({ isDevClerkBypass: () => false }));

async function run(url: string, cookie?: string, method = 'GET') {
  const { default: proxy } = await import('./proxy');
  const req = new NextRequest(url, { method, headers: cookie ? { cookie } : {} });
  return (await proxy(req, {} as never)) ?? NextResponse.next();
}

describe('proxy', () => {
  beforeEach(() => {
    state.userId = null;
    state.clerkError = null;
    state.protect.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends strangers on the carnet to sign in', async () => {
    await run('https://web.sharpit.app/');
    expect(state.protect).toHaveBeenCalled();
  });

  it('keeps a signed-in athlete on the carnet', async () => {
    state.userId = 'user_1';
    const response = await run('https://web.sharpit.app/');
    expect(response.headers.get('location')).toBeNull();
  });

  it('sends a signed-in athlete from sign-in to where Clerk was taking them', async () => {
    state.userId = 'user_1';
    const back = encodeURIComponent('https://sharpit.app/connect/garmin');
    const response = await run(`https://sharpit.app/sign-in?redirect_url=${back}`);
    expect(response.headers.get('location')).toBe('https://sharpit.app/connect/garmin');
  });

  it('sends a signed-in athlete from sign-up to their next screen, never a signed-out page', async () => {
    state.userId = 'user_1';
    const back = encodeURIComponent('https://sharpit.app/welcome');
    const response = await run(`https://sharpit.app/sign-up?redirect_url=${back}`);
    expect(response.headers.get('location')).toBe('https://sharpit.app/start');
  });

  it('serves the app icons to strangers', async () => {
    await run('https://web.sharpit.app/icon');
    await run('https://web.sharpit.app/apple-icon/180');
    await run('https://web.sharpit.app/demo');
    expect(state.protect).not.toHaveBeenCalled();
  });

  it('protects the carnet and the entry router', async () => {
    await run('https://web.sharpit.app/saison');
    await run('https://web.sharpit.app/start');
    expect(state.protect).toHaveBeenCalledTimes(2);
  });

  it('no longer lets the old demo cookie in without a session', async () => {
    await run('https://sharpit.app/compte', 'sharpit_demo=1');
    expect(state.protect).toHaveBeenCalled();
  });

  it('points auth.protect at the app’s own sign-in pages', async () => {
    await import('./proxy');
    expect(state.options).toContainEqual({ signInUrl: '/sign-in', signUpUrl: '/sign-up' });
  });

  it('turns a failed handshake into a clean retry, not a 500', async () => {
    state.clerkError = new Error('Clerk: Handshake token verification failed: invalid signature.');
    const response = await run('https://sharpit.app/?__clerk_handshake=SECRETVALUE');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://sharpit.app/');
  });

  it('still surfaces errors unrelated to a handshake', async () => {
    state.clerkError = new Error('boom');
    await expect(run('https://sharpit.app/saison')).rejects.toThrow('boom');
  });
});
