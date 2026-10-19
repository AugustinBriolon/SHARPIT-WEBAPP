/** Native contract for `/api/body-composition` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/body-composition/handler';
export const GET = inAppLocale(getHandler);
