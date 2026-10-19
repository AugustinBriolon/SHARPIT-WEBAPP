/** Native contract for `/api/food-log/recipes/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { PUT as putHandler } from '@sharpit/server/handlers/food-log/recipes/[id]/handler';
export const PUT = inAppLocale(putHandler);
