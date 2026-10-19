/** Native contract for `/api/garmin/workouts/from-activity` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/garmin/workouts/from-activity/handler';
export const POST = inAppLocale(postHandler);
