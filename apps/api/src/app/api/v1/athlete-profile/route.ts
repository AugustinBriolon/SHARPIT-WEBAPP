/** Native contract for `/api/athlete-profile` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/athlete-profile/handler';
import { PATCH as patchHandler } from '@sharpit/server/handlers/athlete-profile/handler';
export const GET = inAppLocale(getHandler);
export const PATCH = inAppLocale(patchHandler);
