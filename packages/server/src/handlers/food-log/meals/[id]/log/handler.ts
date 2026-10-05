import type { NextRequest } from 'next/server';
import { logSaved } from '../../../template-handlers';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return logSaved(request, (await context.params).id);
}
