/** Native contract for `/api/planned-sessions/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { PATCH as patchHandler } from '@sharpit/server/handlers/planned-sessions/[id]/handler';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/planned-sessions/[id]/handler';
export const PATCH = inAppLocale(patchHandler);
export const DELETE = inAppLocale(deleteHandler);
