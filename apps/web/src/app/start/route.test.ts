import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /start', () => {
  it('sends every sign-in to the carnet, uncached', () => {
    const response = GET(new NextRequest('https://web.sharpit.app/start'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://web.sharpit.app/');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
