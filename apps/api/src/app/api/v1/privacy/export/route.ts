/** Native contract for `/api/privacy/export` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/privacy/export/handler';
export const GET = inAppLocale(getHandler);
