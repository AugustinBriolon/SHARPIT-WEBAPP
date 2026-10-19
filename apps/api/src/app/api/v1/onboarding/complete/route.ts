/** Native contract for `/api/onboarding/complete` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/onboarding/complete/handler';
export const POST = inAppLocale(postHandler);
