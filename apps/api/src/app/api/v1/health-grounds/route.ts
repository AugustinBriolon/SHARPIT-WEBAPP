/** Native contract for health grounds (ADR-124) — Clerk authz, health data like physical notes. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import {
  GET as getHandler,
  PUT as putHandler,
} from '@sharpit/server/handlers/health-grounds/handler';
export const GET = inAppLocale(getHandler);
export const PUT = inAppLocale(putHandler);
