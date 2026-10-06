import { NextResponse, type NextRequest } from 'next/server';

/**
 * Where Clerk lands every sign-in (`ENTRY_PATH`). The carnet reads the account's state
 * itself (ADR-072), so there is only one next screen.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
