/** Native contract for `/api/wellness-checkin` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/wellness-checkin/handler';
import { POST as postHandler } from '@sharpit/server/handlers/wellness-checkin/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
