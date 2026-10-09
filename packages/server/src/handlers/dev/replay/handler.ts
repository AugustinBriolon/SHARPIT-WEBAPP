import { getDevTools, isDevToolsAccessAllowed } from '@sharpit/server/lib/dev/dev-tools';
import { NextRequest, NextResponse } from 'next/server';

type ReplayRequestBody = {
  athleteId?: string;
  since?: string;
  until?: string;
  mode?: string;
};

function parseReplayRequest(body: unknown): ReplayRequestBody | NextResponse {
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  return body as ReplayRequestBody;
}

function validateReplayRequest(body: ReplayRequestBody): NextResponse | null {
  if (!body.athleteId) {
    return NextResponse.json({ error: 'athleteId is required.' }, { status: 400 });
  }
  if (body.mode && body.mode !== 'dry-run' && body.mode !== 'write') {
    return NextResponse.json({ error: 'mode must be "dry-run" or "write".' }, { status: 400 });
  }
  // Default is dry-run. Production write replaces feature sets — require an explicit
  // escape hatch so a mis-aimed admin call cannot persist by accident.
  if (
    body.mode === 'write' &&
    process.env.NODE_ENV === 'production' &&
    process.env.DEV_TOOLS_WRITE !== 'true'
  ) {
    return NextResponse.json(
      {
        error:
          'mode=write is disabled in production. Use dry-run, or set DEV_TOOLS_WRITE=true deliberately.',
      },
      { status: 403 },
    );
  }
  return null;
}

async function readReplayRequest(request: NextRequest): Promise<ReplayRequestBody | NextResponse> {
  try {
    const body = await request.json();
    return parseReplayRequest(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
}

async function runReplay(body: ReplayRequestBody) {
  const { replayEngine } = getDevTools();
  return replayEngine.replay({
    athleteId: body.athleteId!,
    since: body.since ? new Date(`${body.since}T00:00:00Z`) : undefined,
    until: body.until ? new Date(`${body.until}T23:59:59Z`) : undefined,
    mode: (body.mode as 'dry-run' | 'write') ?? 'dry-run',
  });
}

/**
 * Replay Engine API
 *
 * POST /api/dev/replay
 *
 * Body (JSON):
 * {
 *   athleteId: string,
 *   since?: "YYYY-MM-DD",       // default: 90 days ago
 *   until?: "YYYY-MM-DD",       // default: today
 *   mode?: "dry-run" | "write"  // default: "dry-run"
 * }
 *
 * Response:
 *   Full ReplayResult including per-day checksums and summary.
 *
 * Protected by DEV_TOOLS_ENABLED environment flag.
 *
 * ⚠️  mode="write" replaces production feature sets. Use with caution.
 */
export async function POST(request: NextRequest) {
  if (!(await isDevToolsAccessAllowed())) {
    return NextResponse.json({ error: 'Developer tools are not enabled.' }, { status: 404 });
  }

  const parsed = await readReplayRequest(request);
  if (parsed instanceof NextResponse) {
    return parsed;
  }
  const invalid = validateReplayRequest(parsed);
  if (invalid) {
    return invalid;
  }

  try {
    const result = await runReplay(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[dev/replay]', error);
    return NextResponse.json({ error: 'Replay failed.' }, { status: 500 });
  }
}

/**
 * GET /api/dev/replay?athleteId=<id>&run1=<checksum_key>&run2=<checksum_key>
 *
 * Compare two replay checksums.
 * (Advanced usage — compare replays saved externally.)
 *
 * For in-process comparison, use ReplayEngine.compareChecksums() directly.
 */
export async function GET() {
  if (!(await isDevToolsAccessAllowed())) {
    return NextResponse.json({ error: 'Developer tools are not enabled.' }, { status: 404 });
  }

  return NextResponse.json({
    usage: 'POST /api/dev/replay with { athleteId, since?, until?, mode? }',
    modes: {
      'dry-run': 'Compute features without persisting (default, safe)',
      write: 'Compute and persist to production repository (destructive)',
    },
    example: {
      athleteId: 'default',
      since: '2026-06-01',
      until: '2026-07-01',
      mode: 'dry-run',
    },
  });
}
