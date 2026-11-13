/** Native contract for one blood test (ADR-128) — the athlete deletes their own test. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/blood-tests/[id]/handler';
export const DELETE = inAppLocale(deleteHandler);
