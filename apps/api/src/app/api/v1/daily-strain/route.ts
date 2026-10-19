/** Native contract for `/api/daily-strain` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/daily-strain/handler';
export const GET = inAppLocale(getHandler);
