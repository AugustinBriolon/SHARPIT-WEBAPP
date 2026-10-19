/** Native contract for `/api/physical-notes/[id]/checkins` (ADR-040). */
import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/physical-notes/[id]/checkins/handler';
export const POST = inAppLocale(postHandler);
