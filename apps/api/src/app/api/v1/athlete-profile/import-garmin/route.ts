/** Native contract for `/api/athlete-profile/import-garmin` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/athlete-profile/import-garmin/handler';
export const POST = inAppLocale(postHandler);
