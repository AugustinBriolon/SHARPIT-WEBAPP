import type { ClientActivityDetail } from '@sharpit/app/lib/query/types';

export type ActivityDetail = ClientActivityDetail;

export type ActivityPerformanceRecordChip = {
  category: string;
  label: string;
};

export type ActivityStat = { label: string; value: string };

export type ActivitySpec = {
  label: string;
  value: string | number;
  audience?: 'core' | 'expert';
};

export type ChipTone = 'neutral' | 'done' | 'amber' | 'orange' | 'red';

export type PlannedSessionSummary = NonNullable<ActivityDetail['plannedSession']>;

export type ActivityDetailHeaderActivity = Pick<
  ActivityDetail,
  | 'id'
  | 'type'
  | 'title'
  | 'date'
  | 'source'
  | 'garminId'
  | 'stravaId'
  | 'duration'
  | 'load'
  | 'rpe'
  | 'feeling'
  | 'weather'
  | 'plannedSession'
>;
