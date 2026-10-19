/** Native contract for `/api/google/calendars` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/google/calendars/handler';
export const GET = inAppLocale(getHandler);
