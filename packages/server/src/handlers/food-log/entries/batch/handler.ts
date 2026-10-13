import type { NextRequest } from 'next/server';
import { addEntries } from '../../service-handlers';

export const POST = (request: NextRequest) => addEntries(request);
