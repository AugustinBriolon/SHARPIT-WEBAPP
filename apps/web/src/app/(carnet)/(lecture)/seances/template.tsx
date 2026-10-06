import type { ReactNode } from 'react';
import { CarnetPageTransition } from '@/components/carnet/carnet-animated';

/** The list and a session share the reading pages' template: this one makes a session rise. */
export default function SessionsTemplate({ children }: { children: ReactNode }) {
  return <CarnetPageTransition nested>{children}</CarnetPageTransition>;
}
