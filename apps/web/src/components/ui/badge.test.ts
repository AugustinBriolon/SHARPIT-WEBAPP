import { describe, expect, it } from 'vitest';

import { badgeVariants } from './badge';

describe('badgeVariants (Ink & Lime pills, ADR-085)', () => {
  it('paints an achievement lime', () => {
    expect(badgeVariants({ variant: 'lime' })).toContain('bg-highlight');
  });

  it('paints a delta on the neutral chip with tabular figures', () => {
    const classes = badgeVariants({ variant: 'neutral' });
    expect(classes).toContain('bg-chip-surface');
    expect(classes).toContain('tabular-nums');
  });

  it('paints a comparison on the soft lime wash', () => {
    const classes = badgeVariants({ variant: 'soft' });
    expect(classes).toContain('bg-accent');
    expect(classes).toContain('text-accent-foreground');
  });

  it('keeps every pill a capsule', () => {
    expect(badgeVariants({ variant: 'lime' })).toContain('rounded-full');
  });
});
