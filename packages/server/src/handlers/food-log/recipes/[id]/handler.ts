import type { NextRequest } from 'next/server';
import { replaceRecipe } from '../../template-handlers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  return replaceRecipe(request, (await context.params).id);
}
