/** Native contract for `/api/athlete-profile/apply-estimates` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/athlete-profile/apply-estimates/handler';
import { POST as postHandler } from '@sharpit/server/handlers/athlete-profile/apply-estimates/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
