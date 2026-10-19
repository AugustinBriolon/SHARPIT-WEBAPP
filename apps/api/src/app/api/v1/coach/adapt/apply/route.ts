/** Native: applies the coach adjustments the athlete kept, through the web adapter's mapping. */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/coach/adapt/apply/handler';
export const POST = inAppLocale(postHandler);
