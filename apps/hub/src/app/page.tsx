import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  title: 'SharpIt · Coach d’endurance',
  description:
    'Un plan qui se répare, une décision chaque matin. SharpIt construit ta semaine vers ta course, la relit chaque matin et l’ajuste avec toi, raisons à l’appui.',
  alternates: { canonical: 'https://sharpit.app' },
  robots: { index: true, follow: true },
};

export default function HomePage() {
  return <Landing />;
}
