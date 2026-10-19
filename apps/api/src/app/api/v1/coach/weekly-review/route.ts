import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/coach/weekly-review/handler';
import { POST as postHandler } from '@sharpit/server/handlers/coach/weekly-review/handler';
// Segment config is read statically — it cannot be re-exported with the handler.
export const maxDuration = 60;
/** Native contract for `/api/coach/weekly-review` (ADR-040) — same handler, same Clerk authz. */
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
