import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/coach/plan/jobs/handler';
import { GET as getHandler } from '@sharpit/server/handlers/coach/plan/jobs/handler';
// Segment config is read statically — it cannot be re-exported with the handler. The
// generation runs after the response, within this function's time.
export const maxDuration = 300;
/** Native: a week generated in the background, read back by id or as the latest. */
export const POST = inAppLocale(postHandler);
export const GET = inAppLocale(getHandler);
