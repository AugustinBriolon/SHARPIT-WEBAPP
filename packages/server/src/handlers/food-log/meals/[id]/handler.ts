import type { NextRequest } from 'next/server';
import { removeSavedMeal } from '../../template-handlers';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return removeSavedMeal((await context.params).id);
}
