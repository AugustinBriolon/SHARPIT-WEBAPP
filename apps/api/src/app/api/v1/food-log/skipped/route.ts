/** Native contract for `/api/food-log/skipped` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { PUT as putHandler } from '@sharpit/server/handlers/food-log/skipped/handler';
export const PUT = inAppLocale(putHandler);
