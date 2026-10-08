import Image from 'next/image';
import { cn } from '@sharpit/app/lib/utils';
import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import { BrandMark } from '@sharpit/ui/components/ui/brand-mark';

const LOGO_PATHS: Record<Exclude<IntegrationId, 'sharpit'>, string> = {
  strava: '/images/strava.png',
  garmin: '/images/garmin.png',
  withings: '/images/withings.png',
  renpho: '/images/renpho.png',
  google: '/images/googleagenda.png',
  'apple-health': '/images/applehealth.svg',
  'apple-calendar': '/images/applehealth.svg',
};

export function IntegrationLogo({ id, className }: { id: IntegrationId; className?: string }) {
  if (id === 'sharpit') {
    return <BrandMark className={cn('size-10 rounded-xl bg-muted p-1.5', className)} />;
  }
  return (
    <Image
      alt=""
      className={cn('size-10 rounded-xl object-contain', className)}
      height={40}
      src={LOGO_PATHS[id]}
      width={40}
    />
  );
}
