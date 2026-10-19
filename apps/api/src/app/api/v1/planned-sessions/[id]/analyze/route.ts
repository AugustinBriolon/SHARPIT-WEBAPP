import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/planned-sessions/[id]/analyze/handler';
/** Native contract for `/api/planned-sessions/[id]/analyze` (ADR-040) — same handler, same Clerk authz. */
export const POST = inAppLocale(postHandler);
// Segment config is read statically — it cannot be re-exported with the handler.
export const maxDuration = 60;
