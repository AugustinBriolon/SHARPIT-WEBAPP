/** Native contract for `/api/garmin/connect` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import {
  GET as getHandler,
  POST as postHandler,
} from '@sharpit/server/handlers/garmin/connect/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
