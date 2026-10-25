import { cacheLife } from 'next/cache';
import type { Metadata } from 'next';
import { currentUser } from '@clerk/nextjs/server';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CarnetPage,
  CarnetSection,
  InApp,
  Quiet,
  ReadingList,
  ReadingRow,
  RowArrow,
  Unreadable,
} from '@/components/carnet/carnet-parts';
import { CARNET_FRESHNESS, type CarnetPro, readPro } from '@/components/carnet/carnet-read';
import { Reading, Skel } from '@/components/carnet/carnet-reading';
import { CarnetSignOut } from '@/components/carnet/carnet-sign-out';

// Navigations into the page show it at once: the App Shell carries it (ADR-072).
export const instant = true;

function subscriptionLine(subscription: NonNullable<CarnetPro['subscription']>): string {
  const date = subscription.willRenew ? subscription.renewsAt : subscription.expiresAt;
  const day = date ? format(parseISO(date), 'd MMMM yyyy', { locale: fr }) : null;
  if (!day) {
    return 'Abonnement en cours.';
  }
  return subscription.willRenew ? `Renouvelé le ${day}.` : `Prend fin le ${day}.`;
}

/**
 * The few things the web keeps beyond reading: linking a source that needs the browser
 * (Withings, Google Agenda), the athlete's data rights, signing out.
 */
export const metadata: Metadata = { title: 'Compte' };

type Account = { name: string; email: string | null; pro: CarnetPro | null };

async function readAccount(): Promise<Account> {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const [user, pro] = await Promise.all([currentUser(), readPro()]);
  return {
    name: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    pro,
  };
}

export default function CarnetAccountPage() {
  return (
    <CarnetPage
      aside={<CarnetSignOut />}
      kicker="Compte"
      lead={
        <Reading read={readAccount} skeleton="h-4 w-48">
          {(account) => account.email}
        </Reading>
      }
      title={
        <Reading read={readAccount} skeleton="h-8 w-48">
          {(account) => account.name || 'Ton compte'}
        </Reading>
      }
    >
      <CarnetSection
        label="SharpIt Pro"
        title={
          <Reading read={readAccount} skeleton="h-5 w-20">
            {({ pro }) => (pro?.tier === 'PRO' ? 'Pro' : 'Gratuit')}
          </Reading>
        }
      >
        <Reading fallback={<Skel className="h-5 w-64" />} read={readAccount}>
          {({ pro }) => <ProReading pro={pro} />}
        </Reading>
      </CarnetSection>

      <CarnetSection label="Sources et données" title="Ce que tu peux régler ici">
        <ReadingList>
          <ReadingRow href="/compte/sources">
            <p className="font-medium">Sources de données</p>
            <RowArrow />
          </ReadingRow>
          <ReadingRow href="/compte/donnees">
            <p className="font-medium">Confidentialité et données</p>
            <RowArrow />
          </ReadingRow>
        </ReadingList>
        <InApp>Tout le reste (profil, sports, notifications, Garmin, Apple Santé)</InApp>
      </CarnetSection>
    </CarnetPage>
  );
}

function ProReading({ pro }: { pro: CarnetPro | null }) {
  if (!pro) {
    return <Unreadable what="L'abonnement" />;
  }
  if (!pro.subscription) {
    return <InApp>Le passage à SharpIt Pro</InApp>;
  }
  return (
    <Quiet>
      {subscriptionLine(pro.subscription)}{' '}
      {pro.subscription.source === 'apple'
        ? "L'abonnement se gère dans les réglages de l'App Store."
        : ''}
    </Quiet>
  );
}
