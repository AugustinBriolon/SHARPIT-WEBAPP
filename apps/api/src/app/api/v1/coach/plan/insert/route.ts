/** Native: adds a generated week to the plan through the web generator's own mapping. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/coach/plan/insert/handler';
export const POST = inAppLocale(postHandler);
