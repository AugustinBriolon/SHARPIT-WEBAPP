import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buttonTapScale, buttonVariants } from '@sharpit/ui/components/ui/button';

const globalsCss = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');

describe('buttonVariants (Seed ink CTA)', () => {
  it('uses foreground ink for the default filled CTA', () => {
    const classes = buttonVariants({ variant: 'default' });
    expect(classes).toContain('bg-foreground');
    expect(classes).toContain('text-background');
    expect(classes).not.toContain('bg-primary');
  });

  it('keeps accent as chromatic primary for rare emphasis', () => {
    const classes = buttonVariants({ variant: 'accent' });
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('text-primary-foreground');
  });

  it('uses solid destructive with the paired foreground token', () => {
    const classes = buttonVariants({ variant: 'destructive' });
    expect(classes).toContain('bg-destructive');
    expect(classes).toContain('text-destructive-foreground');
    expect(classes).not.toContain('text-white');
    expect(classes).not.toContain('bg-destructive/10');
  });

  it('uses rounded-full for all button sizes', () => {
    expect(buttonVariants({ size: 'default' })).toContain('rounded-full');
    expect(buttonVariants({ size: 'sm' })).toContain('rounded-full');
    expect(buttonVariants({ variant: 'highlight' })).toContain('rounded-full');
  });

  it('keeps instrument visual height at every viewport', () => {
    const classes = buttonVariants({ size: 'default' });
    expect(classes).toContain('h-9');
    expect(classes).toContain('button-hit');
    expect(classes).not.toContain('h-11');
    expect(classes).not.toContain('lg:h-9');
  });

  it('keeps sm compact instead of inflating under lg', () => {
    const classes = buttonVariants({ size: 'sm' });
    expect(classes).toContain('h-8');
    expect(classes).not.toContain('h-11');
    expect(classes).not.toContain('lg:h-8');
  });

  it('keeps icon buttons instrument-sized', () => {
    const classes = buttonVariants({ size: 'icon' });
    expect(classes).toContain('size-9');
    expect(classes).toContain('button-hit');
    expect(classes).not.toContain('size-11');
    expect(classes).not.toContain('lg:size-9');
  });

  it('keeps the outline border at a 3:1 identifying edge', () => {
    const classes = buttonVariants({ variant: 'outline' });
    expect(classes).toContain('border-foreground/55');
    expect(classes).not.toContain('border-foreground/35');
  });

  it('gates hover fills to hover-capable fine pointers', () => {
    const classes = buttonVariants({ variant: 'outline' });
    expect(classes).toContain('[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted');
    expect(classes).toContain('button-motion');
    expect(classes).not.toContain('box-shadow');
    expect(classes.includes(' hover:bg-muted') || classes.startsWith('hover:bg-muted')).toBe(false);
  });

  it('keeps press scale off the variant string so keyboard :active does not inherit it', () => {
    const classes = buttonVariants({ variant: 'outline' });
    expect(classes).not.toContain('scale-[');
    expect(buttonTapScale).toBe('button-press');
  });

  it('grows the tap box on coarse pointers without raising chrome', () => {
    expect(globalsCss).toContain('@utility button-hit');
    expect(globalsCss).toContain('(pointer: coarse)');
    expect(globalsCss).toContain('2.75rem');
  });
});
