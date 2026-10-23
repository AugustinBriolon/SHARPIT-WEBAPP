import { describe, expect, it } from 'vitest';
import { startServerTiming, withServerTiming } from './server-timing';

function clock(...ticks: number[]) {
  let index = 0;
  return () => ticks[Math.min(index++, ticks.length - 1)];
}

describe('startServerTiming', () => {
  it('times each phase from the one before, then the whole request', () => {
    const timing = startServerTiming(clock(0, 12.4, 40, 55));
    timing.mark('auth');
    timing.mark('state');
    expect(timing.header()).toBe('auth;dur=12, state;dur=28, total;dur=55');
  });

  it('names the total as asked', () => {
    expect(startServerTiming(clock(0, 9)).header('app')).toBe('app;dur=9');
  });
});

describe('withServerTiming', () => {
  it('adds the timing after the one the handler wrote', () => {
    const response = new Response('{}', { headers: { 'server-timing': 'today;dur=80' } });
    expect(withServerTiming(response, 'app;dur=90').headers.get('server-timing')).toBe(
      'today;dur=80, app;dur=90',
    );
  });

  it('leaves a response with immutable headers as it is', () => {
    const response = Response.redirect('https://sharpit.app/', 302);
    expect(() => withServerTiming(response, 'app;dur=1')).not.toThrow();
  });
});
