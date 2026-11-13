/** Native contract for blood tests (ADR-128) — Clerk authz, health consent on write. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import {
  GET as getHandler,
  POST as postHandler,
} from '@sharpit/server/handlers/blood-tests/handler';
export const GET = inAppLocale(getHandler);
export const POST = inAppLocale(postHandler);
