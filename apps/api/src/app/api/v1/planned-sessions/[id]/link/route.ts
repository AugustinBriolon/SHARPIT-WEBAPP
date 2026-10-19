/** Native contract for `/api/planned-sessions/[id]/link` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/planned-sessions/[id]/link/handler';
export const POST = inAppLocale(postHandler);
