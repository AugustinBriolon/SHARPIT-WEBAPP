/** Which days carry data for a drill-down, for the native day picker (the web reads `/api/presentation/data-days`). */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/presentation/data-days/handler';
export const GET = inAppLocale(getHandler);
