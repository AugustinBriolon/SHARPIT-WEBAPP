/** Native contract for `/api/goals/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/goals/[id]/handler';
import { PATCH as patchHandler } from '@sharpit/server/handlers/goals/[id]/handler';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/goals/[id]/handler';
export const GET = inAppLocale(getHandler);
export const PATCH = inAppLocale(patchHandler);
export const DELETE = inAppLocale(deleteHandler);
