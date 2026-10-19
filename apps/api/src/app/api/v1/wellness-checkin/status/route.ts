/** Native contract — status-only morning ressenti (no health content). */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/wellness-checkin/status/handler';
export const GET = inAppLocale(getHandler);
