/** Native contract for each day's activity mode over a range — same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/activity-status/days-handler';
export const GET = inAppLocale(getHandler);
