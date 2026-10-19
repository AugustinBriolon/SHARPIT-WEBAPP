/** Native contract for `/api/food-log/foods/barcode/[code]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/food-log/foods/barcode/[code]/handler';
export const GET = inAppLocale(getHandler);
