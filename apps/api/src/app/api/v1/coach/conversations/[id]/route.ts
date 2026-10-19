/** Native contract for `/api/coach/conversations/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/coach/conversations/[id]/handler';
import { PUT as putHandler } from '@sharpit/server/handlers/coach/conversations/[id]/handler';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/coach/conversations/[id]/handler';
export const GET = inAppLocale(getHandler);
export const PUT = inAppLocale(putHandler);
export const DELETE = inAppLocale(deleteHandler);
