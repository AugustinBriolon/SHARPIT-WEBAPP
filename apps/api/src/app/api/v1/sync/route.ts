import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/v1/sync/handler';
export const maxDuration = 300;

export const POST = inAppLocale(postHandler);
