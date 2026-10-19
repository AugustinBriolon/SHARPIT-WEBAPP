/** Native contract for `/api/journal/day-signals` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/journal/day-signals/handler';
export const GET = inAppLocale(getHandler);
