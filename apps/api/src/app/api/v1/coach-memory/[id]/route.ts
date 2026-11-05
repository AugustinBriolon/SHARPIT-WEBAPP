/** Native contract for `/api/coach-memory/[id]` (ADR-040) — same handler, same Clerk authz. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import {
  DELETE as deleteHandler,
  GET as getHandler,
  PATCH as patchHandler,
} from '@sharpit/server/handlers/coach-memory/[id]/handler';
export const GET = inAppLocale(getHandler);
export const PATCH = inAppLocale(patchHandler);
export const DELETE = inAppLocale(deleteHandler);
