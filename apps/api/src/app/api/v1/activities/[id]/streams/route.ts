/** Native contract for `/api/activities/[id]/streams` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/activities/[id]/streams/handler';
export const GET = inAppLocale(getHandler);
