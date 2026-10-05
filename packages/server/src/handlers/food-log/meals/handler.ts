import type { NextRequest } from 'next/server';
import { addSavedMeal, getSavedMeals } from '../template-handlers';

export const GET = () => getSavedMeals();
export const POST = (request: NextRequest) => addSavedMeal(request);
