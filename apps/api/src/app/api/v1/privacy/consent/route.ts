/** Native contract for `/api/privacy/consent` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/privacy/consent/handler';
import { POST as postHandler } from '@sharpit/server/handlers/privacy/consent/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
