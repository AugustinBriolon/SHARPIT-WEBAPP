/** Native contract for `/api/coach/conversations` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/coach/conversations/handler';
import { POST as postHandler } from '@sharpit/server/handlers/coach/conversations/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
