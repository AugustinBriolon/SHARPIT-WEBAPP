import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/v1/health/overview/handler';
export const GET = inAppLocale(getHandler);
