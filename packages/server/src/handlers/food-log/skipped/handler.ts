import type { NextRequest } from 'next/server';
import { putSkippedMeal } from '../service-handlers';

export const PUT = (request: NextRequest) => putSkippedMeal(request);
