/** Native: one background week generation — its drafts, then the week or the failure. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { getJob as getHandler } from '@sharpit/server/handlers/coach/plan/jobs/handler';
export const GET = inAppLocale(getHandler);
