import { NextResponse } from 'next/server';
import { prisma } from '@sharpit/db/client';
import {
  canUseAiProcessingFromProfile,
  hasExistingHealthProcessingContext,
  needsLegalConsentFromProfile,
} from '@sharpit/server/lib/privacy/consent';
import {
  AI_CONSENT_REQUIRED_MESSAGE,
  CURRENT_PRIVACY_VERSION,
  PROVIDER_CONSENT_REQUIRED_MESSAGE,
} from '@sharpit/app/lib/privacy/constants';
import { providerConnectRequirements } from '@sharpit/server/lib/privacy/provider-classification';
import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import { DEMO_CLERK_USER_ID, isDemoSession } from '@sharpit/app/lib/demo/demo-session';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

const CONSENT_SELECT = {
  termsAcceptedAt: true,
  privacyAcceptedAt: true,
  privacyVersion: true,
  healthDataConsentAt: true,
  aiProcessingConsentAt: true,
  unofficialProvidersAckAt: true,
  deletedAt: true,
  clerkUserId: true,
} as const;

export type AthleteConsentRow = {
  termsAcceptedAt: Date | null;
  privacyAcceptedAt: Date | null;
  privacyVersion: string | null;
  healthDataConsentAt: Date | null;
  aiProcessingConsentAt: Date | null;
  unofficialProvidersAckAt: Date | null;
  deletedAt: Date | null;
  clerkUserId: string;
};

export async function getAthleteConsentRow(athleteId: string): Promise<AthleteConsentRow | null> {
  return prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: CONSENT_SELECT,
  });
}

/**
 * Whether the athlete is the shared demo tenant, read from their profile rather than the session:
 * a scheduled job has no session, and Clerk's `auth()` throws outside a Clerk request.
 */
export async function isDemoAthlete(athleteId: string): Promise<boolean> {
  const profile = await getAthleteConsentRow(athleteId);
  return profile?.clerkUserId === DEMO_CLERK_USER_ID;
}

export async function athleteNeedsLegalConsent(athleteId: string): Promise<boolean> {
  if (await isDemoSession()) {
    return false;
  }
  if (isDevClerkBypass()) {
    return false;
  }

  const profile = await getAthleteConsentRow(athleteId);
  if (!profile || profile.clerkUserId === DEMO_CLERK_USER_ID) {
    return false;
  }
  if (profile.deletedAt) {
    return false;
  }

  return needsLegalConsentFromProfile({
    termsAcceptedAt: profile.termsAcceptedAt,
    privacyAcceptedAt: profile.privacyAcceptedAt,
    privacyVersion: profile.privacyVersion,
    healthDataConsentAt: profile.healthDataConsentAt,
    currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
    isDemo: false,
    isDevBypass: false,
  });
}

/**
 * Santé providers linked or health observation rows already stored.
 * Soft-wall always requires health consent (option B); this helper covers
 * audits / UI copy for athletes who already hold Art. 9 data.
 */
export async function athleteHasExistingHealthContext(athleteId: string): Promise<boolean> {
  const [withings, renpho, dailyHealth, body, nutrition] = await Promise.all([
    prisma.withingsAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.renphoAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.dailyHealth.findFirst({ where: { athleteId }, select: { id: true } }),
    prisma.bodyCompositionMeasurement.findFirst({ where: { athleteId }, select: { id: true } }),
    prisma.dailyNutrition.findFirst({ where: { athleteId }, select: { id: true } }),
  ]);

  return hasExistingHealthProcessingContext({
    hasHealthProviderAccount: Boolean(withings || renpho),
    hasHealthObservationRows: Boolean(dailyHealth || body || nutrition),
  });
}

/*
 * The three checks below are keyed by athlete, not by session: they also run in scheduled jobs
 * (the sync cron), which carry no Clerk session. The demo athlete is recognised by its profile.
 */
export async function athleteHasAiProcessingConsent(athleteId: string): Promise<boolean> {
  if (isDevClerkBypass()) {
    return true;
  }
  const profile = await getAthleteConsentRow(athleteId);
  if (!profile || profile.clerkUserId === DEMO_CLERK_USER_ID) {
    return true;
  }
  return canUseAiProcessingFromProfile(profile);
}

export async function athleteHasHealthDataConsent(athleteId: string): Promise<boolean> {
  if (isDevClerkBypass()) {
    return true;
  }
  const profile = await getAthleteConsentRow(athleteId);
  if (!profile || profile.clerkUserId === DEMO_CLERK_USER_ID) {
    return true;
  }
  return Boolean(profile.healthDataConsentAt);
}

export function canConnectProviderFromConsents(
  profile: Pick<AthleteConsentRow, 'healthDataConsentAt' | 'unofficialProvidersAckAt'>,
  integrationId: IntegrationId,
): boolean {
  const req = providerConnectRequirements(integrationId);
  if (req.needsHealthConsent && !profile.healthDataConsentAt) {
    return false;
  }
  if (req.needsUnofficialAck && !profile.unofficialProvidersAckAt) {
    return false;
  }
  return true;
}

export async function athleteCanConnectProvider(
  athleteId: string,
  integrationId: IntegrationId,
): Promise<boolean> {
  if (isDevClerkBypass()) {
    return true;
  }
  const profile = await getAthleteConsentRow(athleteId);
  if (!profile || profile.clerkUserId === DEMO_CLERK_USER_ID) {
    return true;
  }
  return canConnectProviderFromConsents(profile, integrationId);
}

/** 403 JSON when AI consent is missing — for LLM coach / briefing routes. */
export async function requireAiProcessingConsent(athleteId: string): Promise<NextResponse | null> {
  if (await athleteHasAiProcessingConsent(athleteId)) {
    return null;
  }
  return NextResponse.json(
    { error: AI_CONSENT_REQUIRED_MESSAGE, code: 'ai_processing_consent_required' },
    { status: 403 },
  );
}

/** 403 JSON when provider connect consents are missing for this integration. */
export async function requireProviderConnectConsent(
  athleteId: string,
  integrationId: IntegrationId,
): Promise<NextResponse | null> {
  if (await athleteCanConnectProvider(athleteId, integrationId)) {
    return null;
  }
  return NextResponse.json(
    { error: PROVIDER_CONSENT_REQUIRED_MESSAGE, code: 'provider_consent_required' },
    { status: 403 },
  );
}

export type ConsentUpdateInput = {
  acceptLegal?: boolean;
  healthDataConsent?: boolean;
  aiProcessingConsent?: boolean;
  unofficialProvidersAck?: boolean;
};

export async function updateAthleteConsents(
  athleteId: string,
  input: ConsentUpdateInput,
): Promise<AthleteConsentRow> {
  const now = new Date();
  const data: {
    termsAcceptedAt?: Date;
    privacyAcceptedAt?: Date;
    privacyVersion?: string;
    healthDataConsentAt?: Date | null;
    aiProcessingConsentAt?: Date | null;
    unofficialProvidersAckAt?: Date | null;
  } = {};

  if (input.acceptLegal) {
    data.termsAcceptedAt = now;
    data.privacyAcceptedAt = now;
    data.privacyVersion = CURRENT_PRIVACY_VERSION;
  }
  if (input.healthDataConsent === true) {
    data.healthDataConsentAt = now;
  }
  if (input.healthDataConsent === false) {
    data.healthDataConsentAt = null;
  }
  if (input.aiProcessingConsent === true) {
    data.aiProcessingConsentAt = now;
  }
  if (input.aiProcessingConsent === false) {
    data.aiProcessingConsentAt = null;
  }
  if (input.unofficialProvidersAck === true) {
    data.unofficialProvidersAckAt = now;
  }
  if (input.unofficialProvidersAck === false) {
    data.unofficialProvidersAckAt = null;
  }

  const updated = await prisma.athleteProfile.update({
    where: { id: athleteId },
    data,
    select: CONSENT_SELECT,
  });

  // Science Sport evidence holds health-derived inputs — purge on health or AI consent withdraw.
  if (input.healthDataConsent === false || input.aiProcessingConsent === false) {
    try {
      const { purgeAnalysisEvidenceForAthlete } =
        await import('@sharpit/server/lib/science/reliability/analysis-evidence-store');
      await purgeAnalysisEvidenceForAthlete(athleteId);
    } catch (error) {
      logSafeError('privacy/purge-analysis-evidence-consent', error, { athleteId });
    }
  }

  return updated;
}
