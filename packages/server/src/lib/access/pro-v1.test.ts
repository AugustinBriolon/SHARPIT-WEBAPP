import { describe, expect, it } from 'vitest';
import { projectV1Pro } from '@sharpit/server/lib/access/pro-v1';
import { ALL_PRO_PERKS } from '@sharpit/app/lib/access/pro-perks';

describe('projectV1Pro', () => {
  it('serves every perk from pro-perks.ts, by stable id, without web-only fields', () => {
    const pro = projectV1Pro('FREE', null);
    expect(pro.tier).toBe('FREE');
    expect(pro.subscription).toBeNull();
    expect(pro.perks.map((p) => p.id)).toEqual(ALL_PRO_PERKS.map((p) => p.id));
    expect(Object.keys(pro.perks[0]!).sort()).toEqual(['description', 'id', 'status', 'title']);
  });

  it('keeps perk ids unique', () => {
    const ids = ALL_PRO_PERKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not sell the iPhone calendar copy: it is free once Apple Calendar is linked', () => {
    expect(ALL_PRO_PERKS.map((p) => p.id)).not.toContain('calendar-sync');
  });
});
