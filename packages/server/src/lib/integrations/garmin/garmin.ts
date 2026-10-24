/** One Garmin day as SharpIt stores it, assembled from the Health API pushes. */
export interface GarminReadinessFactor {
  key: string;
  percent: number | null;
  feedback: string | null;
}

export interface GarminSleepDetail {
  sleepMinutes: number | null;
  napMinutes: number | null;
  sleepScore: number | null;
  sleepDeepMin: number | null;
  sleepLightMin: number | null;
  sleepRemMin: number | null;
  sleepAwakeMin: number | null;
  sleepBedtimeMin: number | null;
  sleepWakeMin: number | null;
  sleepRespiration: number | null;
  sleepAvgStress: number | null;
  sleepScoreFeedback: string | null;
}

export interface GarminDailyHealth {
  date: string;
  sleepMinutes: number | null;
  napMinutes: number | null;
  restingHr: number | null;
  hrv: number | null;
  weightKg: number | null;
  readinessScore: number | null;
  readinessLevel: string | null;
  readinessFeedback: string | null;
  readinessFactors: GarminReadinessFactor[] | null;
  hrvStatus: string | null;
  hrvBaselineLow: number | null;
  hrvBaselineHigh: number | null;
  stress: number | null;
  bodyBattery: number | null;
  /** Daily step count from Garmin wellness stats. */
  totalSteps: number | null;
  sleep: GarminSleepDetail;
}

const EMPTY_SLEEP: GarminSleepDetail = {
  sleepMinutes: null,
  napMinutes: null,
  sleepScore: null,
  sleepDeepMin: null,
  sleepLightMin: null,
  sleepRemMin: null,
  sleepAwakeMin: null,
  sleepBedtimeMin: null,
  sleepWakeMin: null,
  sleepRespiration: null,
  sleepAvgStress: null,
  sleepScoreFeedback: null,
};

/** A day with nothing known: each push fills only what its summary carries. */
export function emptyGarminDailyHealth(date: string): GarminDailyHealth {
  return {
    date,
    sleepMinutes: null,
    napMinutes: null,
    restingHr: null,
    hrv: null,
    weightKg: null,
    readinessScore: null,
    readinessLevel: null,
    readinessFeedback: null,
    readinessFactors: null,
    hrvStatus: null,
    hrvBaselineLow: null,
    hrvBaselineHigh: null,
    stress: null,
    bodyBattery: null,
    totalSteps: null,
    sleep: { ...EMPTY_SLEEP },
  };
}
