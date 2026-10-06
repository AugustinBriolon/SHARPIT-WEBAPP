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

export default async function CarnetAccountPage() {
  'use cache: private';
  cacheLife(CARNET_FRESHNESS);
  const [user, pro] = await Promise.all([currentUser(), readPro()]);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <CarnetPage
      aside={<CarnetSignOut />}
      kicker="Compte"
      lead={email ?? undefined}
      title={name || 'Ton compte'}
    >
      <CarnetSection label="SharpIt Pro" title={pro?.tier === 'PRO' ? 'Pro' : 'Gratuit'}>
        {pro ? (
          pro.subscription ? (
            <Quiet>
              {subscriptionLine(pro.subscription)}{' '}
              {pro.subscription.source === 'apple'
                ? "L'abonnement se gère dans les réglages de l'App Store."
                : ''}
            </Quiet>
          ) : (
            <InApp>Le passage à SharpIt Pro</InApp>
          )
        ) : (
          <Unreadable what="L'abonnement" />
        )}
      </CarnetSection>

      <CarnetSection label="Sources et données" title="Ce que tu peux régler ici">
        <ReadingList>
          <ReadingRow href="/compte/sources">
            <div>
              <p className="font-medium">Sources de données</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Relier Withings ou Google Agenda, qui passent par le navigateur.
              </p>
            </div>
            <RowArrow />
          </ReadingRow>
          <ReadingRow href="/compte/donnees">
            <div>
              <p className="font-medium">Confidentialité et données</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Tes consentements, l&apos;export de tes données, la suppression du compte.
              </p>
            </div>
            <RowArrow />
          </ReadingRow>
        </ReadingList>
        <InApp>Tout le reste (profil, sports, notifications, Garmin, Apple Santé)</InApp>
      </CarnetSection>
    </CarnetPage>
  );
}
