import type { NextRequest } from 'next/server';
import { addRecipe } from '../template-handlers';

export const POST = (request: NextRequest) => addRecipe(request);
