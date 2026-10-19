/** Native contract for `/api/training-plans/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/training-plans/[id]/handler';
export const DELETE = inAppLocale(deleteHandler);
