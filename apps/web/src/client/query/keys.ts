export const queryKeys = {
  activities: ['activities'] as const,
  activity: (id: string) => ['activity', id] as const,
  health: (days: number, date?: string) => ['health', days, date ?? 'today'] as const,
  bodyComposition: (days?: number | 'all') => ['body-composition', days ?? 'all'] as const,
  goals: ['goals'] as const,
  goalAchievements: (limit?: number) => ['goals', 'achievements', limit ?? 20] as const,
  plannedSessions: ['planned-sessions'] as const,
  brickAnalysis: (groupId: string) => ['brick-analysis', groupId] as const,
  brickEvaluation: (groupId: string) => ['brick-evaluation', groupId] as const,
  activityStream: (id: string) => ['activity-stream', id] as const,
  /** Batch GPS paths for Activité hub cards — one key for the whole athlete. */
  activityRoutePreviews: ['activity-route-previews'] as const,
  multisportStreams: (id: string) => ['multisport-streams', id] as const,
  physicalNotes: ['physical-notes'] as const,
  coachContext: ['coach-context'] as const,
  coachMemory: ['coach-memory'] as const,
  travelContext: ['travel-context'] as const,
  dayJournal: (trainingDayId: string) => ['day-journal', trainingDayId] as const,
  activityStatus: ['activity-status'] as const,
  journalPrefs: ['journal-prefs'] as const,
  journalDaySignals: (trainingDayId: string) => ['journal-day-signals', trainingDayId] as const,
  journalHabitBridge: ['journal-habit-bridge'] as const,
  journalHabitExperiments: ['journal-habit-experiments'] as const,
  googleEvents: (from: string, to: string) => ['google-events', from, to] as const,
  googleCalendars: ['google-calendars'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  weeklyReview: (date: string) => ['weekly-review', date] as const,
  records: ['records'] as const,
  trainingPlan: ['training-plan'] as const,
  thresholdHistory: ['threshold-history'] as const,
  thresholdPreview: ['threshold-preview'] as const,
  athleteProfile: ['athlete-profile'] as const,
  athleteSnapshot: (trainingDayId: string) => ['athlete-snapshot', trainingDayId] as const,
  today: (trainingDayId: string) => ['today', trainingDayId] as const,
  /** Prefix — invalidate / patch every presentation query. */
  presentationRoot: ['presentation'] as const,
  presentationToday: (trainingDayId: string) => ['presentation', 'today', trainingDayId] as const,
  /** Prefix — all Today presentation day keys. */
  presentationTodayAll: ['presentation', 'today'] as const,
  presentationRecovery: (trainingDayId: string) =>
    ['presentation', 'recovery', trainingDayId] as const,
  presentationSleep: (trainingDayId: string) => ['presentation', 'sleep', trainingDayId] as const,
  presentationEffort: (trainingDayId: string) => ['presentation', 'effort', trainingDayId] as const,
  presentationAdaptation: (trainingDayId: string) =>
    ['presentation', 'adaptation', trainingDayId] as const,
  presentationPhysicalHealth: (trainingDayId: string) =>
    ['presentation', 'physical-health', trainingDayId] as const,
  presentationBody: ['presentation', 'body', 'all'] as const,
  presentationNutrition: (trainingDayId: string) =>
    ['presentation', 'nutrition', trainingDayId] as const,
  /** Prefix — every nutrition presentation day (page and Today card alike). */
  presentationNutritionAll: ['presentation', 'nutrition'] as const,
  presentationSettingsHub: ['presentation', 'settings-hub'] as const,
  /** Under the presentation root so provider syncs refresh the date selector dots. */
  presentationDataDays: (domain: string, from: string, to: string) =>
    ['presentation', 'data-days', domain, from, to] as const,
  /** Prefix — every date-selector range of one domain. */
  presentationDataDaysDomain: (domain: string) => ['presentation', 'data-days', domain] as const,
  presentationScenarioComparison: (horizonDays: number, anchorTrainingDayId?: string) =>
    ['presentation', 'scenario-comparison', horizonDays, anchorTrainingDayId ?? 'now'] as const,
  presentationScenarioComparisonAll: ['presentation', 'scenario-comparison'] as const,
  presentationProjectedAthlete: (horizonDays: number, anchorTrainingDayId?: string) =>
    ['presentation', 'projected-athlete', horizonDays, anchorTrainingDayId ?? 'now'] as const,
  presentationProjectedAthleteAll: ['presentation', 'projected-athlete'] as const,
  wellnessCheckin: (trainingDayId: string) => ['wellness-checkin', trainingDayId] as const,
  plannedSessionPresentation: (sessionId: string) =>
    ['presentation', 'planned-session', sessionId] as const,
  sessionRationale: (sessionId: string) =>
    ['presentation', 'session-rationale', sessionId] as const,
  weeklyCoachingBrief: (weekStart: string) =>
    ['presentation', 'weekly-coaching-brief', weekStart] as const,
  /** Background coach analyses — polled only while one is in flight. */
  analysisRuns: ['analysis-runs'] as const,
  /** The in-app food log of one day: entries, targets and recent foods (ADR-061). */
  foodLogDay: (trainingDayId: string) => ['food-log', trainingDayId] as const,
  foodLogDayAll: ['food-log'] as const,
  foodSearch: (query: string) => ['food-search', query] as const,
  foodSearchAll: ['food-search'] as const,
  /** The athlete's own foods, to pick, edit or delete. */
  ownFoods: ['food-own'] as const,
  /** Meals the athlete kept to log again in one tap (ADR-071). */
  savedMeals: ['food-saved-meals'] as const,
  hikeTrips: ['hike-trips'] as const,
  hikeTrip: (id: string) => ['hike-trip', id] as const,
};
