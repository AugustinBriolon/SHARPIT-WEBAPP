/** Native contract for `/api/privacy/delete` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/privacy/delete/handler';
export const POST = inAppLocale(postHandler);
