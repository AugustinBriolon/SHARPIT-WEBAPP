/** Native contract for `/api/journal-prefs` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/journal-prefs/handler';
import { PUT as putHandler } from '@sharpit/server/handlers/journal-prefs/handler';
export const GET = inAppLocale(getHandler);
export const PUT = inAppLocale(putHandler);
