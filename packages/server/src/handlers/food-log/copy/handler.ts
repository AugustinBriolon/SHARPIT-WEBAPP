import type { NextRequest } from 'next/server';
import { copyEntries } from '../template-handlers';

export const POST = (request: NextRequest) => copyEntries(request);
