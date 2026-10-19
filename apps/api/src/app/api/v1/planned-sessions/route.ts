/** Native contract for `/api/planned-sessions` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/planned-sessions/handler';
import { POST as postHandler } from '@sharpit/server/handlers/planned-sessions/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
