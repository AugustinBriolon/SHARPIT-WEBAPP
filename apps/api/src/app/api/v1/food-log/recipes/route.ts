/** Native contract for `/api/food-log/recipes` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/food-log/recipes/handler';
export const POST = inAppLocale(postHandler);
