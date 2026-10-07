import { NextResponse } from 'next/server';

/** Product surface for MyFitnessPal was withdrawn (ADR-073). Routes answer 410 Gone. */
export const MYFITNESSPAL_WITHDRAWN_BODY = {
  error: "L'intégration MyFitnessPal n'est plus disponible.",
} as const;

export function myfitnesspalWithdrawnResponse() {
  return NextResponse.json(MYFITNESSPAL_WITHDRAWN_BODY, { status: 410 });
}

export async function POST(_request?: Request) {
  return myfitnesspalWithdrawnResponse();
}

export async function GET(_request?: Request) {
  return myfitnesspalWithdrawnResponse();
}
