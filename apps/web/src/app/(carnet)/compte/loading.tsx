import { CarnetPageSkeleton } from '@/components/carnet/carnet-skeleton';

// Below the layout the pages share, so a navigation shows it at once (ADR-072).
export default function Loading() {
  return <CarnetPageSkeleton />;
}
