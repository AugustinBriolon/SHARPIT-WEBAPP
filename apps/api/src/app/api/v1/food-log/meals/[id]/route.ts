/** Native contract for `/api/food-log/meals/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/food-log/meals/[id]/handler';
export const DELETE = inAppLocale(deleteHandler);
