import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/v1/push/device-token/handler';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/v1/push/device-token/handler';
export const POST = inAppLocale(postHandler);
export const DELETE = inAppLocale(deleteHandler);
