/** Native contract for `/api/withings/disconnect` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/withings/disconnect/handler';
export const POST = inAppLocale(postHandler);
