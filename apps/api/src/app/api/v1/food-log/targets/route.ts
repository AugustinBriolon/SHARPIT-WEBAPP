/** Native contract for `/api/food-log/targets` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { PUT as putHandler } from '@sharpit/server/handlers/food-log/targets/handler';
export const PUT = inAppLocale(putHandler);
