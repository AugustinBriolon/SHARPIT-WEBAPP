import { NextResponse } from 'next/server';
import { prisma } from '@sharpit/db/client';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { JOURNAL_ANALYSIS_MIN_DAYS } from '@sharpit/app/lib/journal/journal-limits';
import { loadJournalHabitFindings } from '@sharpit/server/lib/journal/journal-habit-analysis-load';
import { projectV1JournalAnalyses } from '@sharpit/server/lib/presentation/v1/journal-analyses';

/** The journal's habit associations for native clients (`V1JournalAnalysesResponse`). */
export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    const { daysWithSignal, daysInSpan, findings } = await loadJournalHabitFindings(
      prisma,
      athleteId,
    );
    return NextResponse.json(
      projectV1JournalAnalyses({
        minDays: JOURNAL_ANALYSIS_MIN_DAYS,
        daysWithSignal,
        daysInSpan,
        findings,
      }),
    );
  } catch (error) {
    console.error('[api/v1/journal/analyses]', {
      name: error instanceof Error ? error.name : 'Error',
    });
    return NextResponse.json({ error: 'Analyses indisponibles' }, { status: 500 });
  }
}
