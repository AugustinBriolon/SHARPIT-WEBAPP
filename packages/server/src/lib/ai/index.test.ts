import { describe, expect, it } from 'vitest';
import { coachAsyncGatewayOptions, coachGatewayOptions } from './index';

describe('coach gateway options', () => {
  it('keeps interactive chat on the default tier', () => {
    expect(coachGatewayOptions.gateway).not.toHaveProperty('serviceTier');
  });

  it('routes background jobs to Flex without changing the model failover list', () => {
    expect(coachAsyncGatewayOptions.gateway.serviceTier).toBe('flex');
    expect(coachAsyncGatewayOptions.gateway.models).toEqual(coachGatewayOptions.gateway.models);
    expect(coachAsyncGatewayOptions.gateway.caching).toBe('auto');
  });
});
