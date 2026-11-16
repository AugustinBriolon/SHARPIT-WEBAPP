/** Native-only: deletes a meal logged whole, with its foods (ADR-134). */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { DELETE as deleteHandler } from '@sharpit/server/handlers/food-log/groups/[id]/handler';
export const DELETE = inAppLocale(deleteHandler);
