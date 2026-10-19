/** Native contract for `/api/coach/context` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { PUT as putHandler } from '@sharpit/server/handlers/coach/context/handler';
export const PUT = inAppLocale(putHandler);
