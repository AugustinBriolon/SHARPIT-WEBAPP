import type { ReactNode } from 'react';
import { CarnetPageTransition } from '@/components/carnet/carnet-animated';

/**
 * A template, not a layout: it mounts again whenever the page under it changes, so each page
 * arrives. It sits here rather than above, where every reading page shares one segment.
 */
export default function CarnetTemplate({ children }: { children: ReactNode }) {
  return <CarnetPageTransition>{children}</CarnetPageTransition>;
}
