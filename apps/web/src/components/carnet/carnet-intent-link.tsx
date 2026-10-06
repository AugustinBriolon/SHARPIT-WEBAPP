'use client';

import { type ComponentProps, useState } from 'react';
import Link from 'next/link';

/**
 * A row of a list: many on a page, each its own address (a session's id). Prefetching them all
 * as they scroll by would read every session; this one reads its page, the id resolved, as
 * soon as the pointer or a finger comes to it, so the click usually finds it ready.
 */
export function CarnetIntentLink(props: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  const [intent, setIntent] = useState(false);
  const show = () => setIntent(true);
  return (
    <Link {...props} prefetch={intent} onFocus={show} onPointerEnter={show} onTouchStart={show} />
  );
}
