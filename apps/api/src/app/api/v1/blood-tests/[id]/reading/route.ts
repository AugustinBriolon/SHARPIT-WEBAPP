/** Native contract for a blood test's athlete reading (ADR-129) — Pro, no model involved. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/blood-tests/[id]/reading/handler';
export const GET = inAppLocale(getHandler);
