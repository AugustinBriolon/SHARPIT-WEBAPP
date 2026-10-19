/** Native contract for `/api/coach-memory/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/coach-memory/[id]/handler';
export const DELETE = inAppLocale(deleteHandler);
