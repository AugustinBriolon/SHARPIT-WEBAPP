/**
 * Whether a Prisma call failed on a unique constraint (P2002).
 *
 * Read from the error's shape, not `instanceof`: bundled, `@prisma/client/runtime/library` can be a
 * different copy of the class from the one the client throws, and the check then failed silently —
 * the race recovery for a new athlete's first requests never ran (Sentry SHARPIT-WEBAPP-A).
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
