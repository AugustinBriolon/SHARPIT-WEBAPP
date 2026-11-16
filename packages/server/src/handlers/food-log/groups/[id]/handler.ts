import type { NextRequest } from 'next/server';
import { deleteGroup } from '../../service-handlers';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return deleteGroup((await context.params).id);
}
