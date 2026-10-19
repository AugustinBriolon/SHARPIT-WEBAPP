import { inAppLocale } from '@sharpit/server/lib/locale/locale-context';
import { POST as postHandler } from '@sharpit/server/handlers/coach/chat/handler';
// A planning turn chains up to four model steps; at 60 s Vercel cut it mid-answer.
export const maxDuration = 300;

// The app calls this one outside /api/v1: it answers in the app's language too (ADR-096).
export const POST = inAppLocale(postHandler);
