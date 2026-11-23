import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import {
  GET as getHandler,
  PUT as putHandler,
} from '@sharpit/server/handlers/v1/strength-exercises/handler';
export const GET = inAppLocale(getHandler);
export const PUT = inAppLocale(putHandler);
