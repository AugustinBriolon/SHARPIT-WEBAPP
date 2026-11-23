'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The white sheet a page is drawn on. From `lg` up it is as tall as the screen and never taller:
 * the page scrolls inside it and nothing around it moves (ADR-144). Since the document no longer
 * scrolls there, a new page starts at the sheet's top here, as the browser would have done.
 * Below `lg` and on paper the sheet is as tall as its page and the document scrolls.
 */
export function CarnetSheet({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div
      ref={ref}
      className="lg:border-border lg:bg-card px-4 pt-10 sm:px-8 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:rounded-(--shape-sheet) lg:border lg:px-12 print:h-auto print:overflow-visible print:border-0 print:px-0 print:pt-0"
    >
      {children}
    </div>
  );
}
