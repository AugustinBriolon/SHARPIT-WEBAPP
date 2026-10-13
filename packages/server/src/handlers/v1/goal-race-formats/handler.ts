import { NextResponse } from 'next/server';
import { RACE_FORMATS } from '@sharpit/app/lib/goals/race-formats';

/** The race-format catalog the goal form picks from (ADR-082). Static and not personal: no athlete read. */
export function GET() {
  return NextResponse.json(RACE_FORMATS);
}
