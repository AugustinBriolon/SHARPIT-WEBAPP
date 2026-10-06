import type { ReactNode } from 'react';
import { CarnetPageTransition } from '@/components/carnet/carnet-animated';

/**
 * A template, not a layout: it mounts again whenever the page under it changes, so each page
 * arrives. Compte's pages get their own, as the reading pages do.
 */
export default function CarnetTemplate({ children }: { children: ReactNode }) {
  return <CarnetPageTransition>{children}</CarnetPageTransition>;
}
