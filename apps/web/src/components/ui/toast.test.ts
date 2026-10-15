import { describe, expect, it } from 'vitest';

import { toastCloseClass, toastRootClass, toastViewportClass } from '@/components/ui/toast';

describe('toastViewportClass', () => {
  it('anchors under the top safe-area — clear of the floating tab bar', () => {
    expect(toastViewportClass).toContain('top-[max(0.75rem,env(safe-area-inset-top,0px))]');
    expect(toastViewportClass).not.toContain('bottom-[');
    expect(toastViewportClass).not.toContain('bottom-nav-offset');
  });

  it('keeps a thin centered capsule on every viewport', () => {
    expect(toastViewportClass).toContain('inset-x-0');
    expect(toastViewportClass).toContain('mx-auto');
    expect(toastViewportClass).toContain('w-[min(18rem,calc(100vw-2rem))]');
    expect(toastViewportClass).not.toContain('right-4');
  });

  it('keeps the band inert so it cannot swallow taps', () => {
    expect(toastViewportClass).toContain('pointer-events-none');
  });
});

describe('toastRootClass', () => {
  it('enters and exits from the top edge', () => {
    expect(toastRootClass).toContain('origin-top');
    expect(toastRootClass).toContain('data-starting-style:[transform:translateY(-120%)]');
    expect(toastRootClass).toContain(
      '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-120%)]',
    );
  });

  it('uses touch-none so the banner follows the pointer without scroll chaining', () => {
    expect(toastRootClass).toContain('touch-none');
  });
});

describe('toastCloseClass', () => {
  it('keeps a compact close target for the slim toast chrome', () => {
    expect(toastCloseClass).toContain('size-7');
  });
});
