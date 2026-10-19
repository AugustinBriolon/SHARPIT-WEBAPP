/** Native contract for `/api/goals` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/goals/handler';
import { POST as postHandler } from '@sharpit/server/handlers/goals/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
