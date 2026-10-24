import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/garmin/sync/handler';
// Segment config is read statically — it cannot be re-exported with the handler.
export const maxDuration = 300;
/** Native contract for `/api/garmin/sync` (ADR-040) — same handler, same Clerk authz. */
export const POST = inAppLocale(postHandler);
