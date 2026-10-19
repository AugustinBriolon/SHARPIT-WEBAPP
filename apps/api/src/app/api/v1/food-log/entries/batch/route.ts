/** Native-only: several food-log entries in one transaction (a described meal validated whole). */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/food-log/entries/batch/handler';
export const POST = inAppLocale(postHandler);
