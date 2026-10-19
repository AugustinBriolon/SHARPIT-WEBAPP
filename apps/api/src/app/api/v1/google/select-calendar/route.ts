/** Native contract for `/api/google/select-calendar` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/google/select-calendar/handler';
export const POST = inAppLocale(postHandler);
