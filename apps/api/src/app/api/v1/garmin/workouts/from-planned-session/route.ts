/** Native contract for `/api/garmin/workouts/from-planned-session` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/garmin/workouts/from-planned-session/handler';
export const POST = inAppLocale(postHandler);
