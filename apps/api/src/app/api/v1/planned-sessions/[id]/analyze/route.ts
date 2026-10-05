/** Native contract for `/api/planned-sessions/[id]/analyze` (ADR-040) — same handler, same Clerk authz. */
export { POST } from '@sharpit/server/handlers/planned-sessions/[id]/analyze/handler';
// Segment config is read statically — it cannot be re-exported with the handler.
export const maxDuration = 60;
