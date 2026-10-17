import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  clerkFrontendApiOrigin,
} from '@sharpit/app/lib/security/content-security-policy';

const keyFor = (host: string, env = 'live') =>
  `pk_${env}_${Buffer.from(`${host}$`).toString('base64')}`;

function directive(policy: string, name: string): string[] {
  const found = policy.split('; ').find((entry) => entry.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

const production = buildContentSecurityPolicy({
  apiOrigin: 'https://api.sharpit.app',
  clerkPublishableKey: keyFor('clerk.sharpit.app'),
  isDev: false,
});

describe('clerkFrontendApiOrigin', () => {
  it('reads the Frontend API host from the publishable key', () => {
    expect(clerkFrontendApiOrigin(keyFor('clerk.sharpit.app'))).toBe('https://clerk.sharpit.app');
    expect(clerkFrontendApiOrigin(keyFor('fine-cat-12.clerk.accounts.dev', 'test'))).toBe(
      'https://fine-cat-12.clerk.accounts.dev',
    );
  });

  it('ignores a missing or malformed key', () => {
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(
      clerkFrontendApiOrigin('pk_live_' + Buffer.from('evil.com/x$').toString('base64')),
    ).toBeNull();
  });
});

describe('buildContentSecurityPolicy', () => {
  it('lets the browser call the API host the web app talks to', () => {
    expect(directive(production, 'connect-src')).toContain('https://api.sharpit.app');
  });

  it('names Clerk, Sentry and the map tiles exactly, with no wildcard on Clerk', () => {
    const connect = directive(production, 'connect-src');
    expect(connect).toContain('https://clerk.sharpit.app');
    expect(connect).toContain('https://o4512180262535168.ingest.de.sentry.io');
    expect(production).not.toContain('clerk.accounts.dev');
    expect(production).not.toContain('*.clerk.com');
  });

  it('allows eval in development only', () => {
    expect(directive(production, 'script-src')).not.toContain("'unsafe-eval'");
    const dev = buildContentSecurityPolicy({ isDev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
  });

  it('forbids plugins, framing and base rewrites', () => {
    expect(directive(production, 'object-src')).toEqual(["'none'"]);
    expect(directive(production, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(production, 'base-uri')).toEqual(["'self'"]);
  });
});
