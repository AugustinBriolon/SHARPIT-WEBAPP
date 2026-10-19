import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/v1/health-workouts/handler';
export const POST = inAppLocale(postHandler);
