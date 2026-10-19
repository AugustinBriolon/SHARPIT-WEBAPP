/** Native contract for `/api/planned-sessions/brick/evaluation` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/planned-sessions/brick/evaluation/handler';
import { PUT as putHandler } from '@sharpit/server/handlers/planned-sessions/brick/evaluation/handler';
export const GET = inAppLocale(getHandler);
export const PUT = inAppLocale(putHandler);
