import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { GET as getHandler } from '@sharpit/server/handlers/integrations/source-prefs/handler';
import { PATCH as patchHandler } from '@sharpit/server/handlers/integrations/source-prefs/handler';
export const GET = inAppLocale(getHandler);
export const PATCH = inAppLocale(patchHandler);
