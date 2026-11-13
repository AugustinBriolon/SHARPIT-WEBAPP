/**
 * Blood markers (ADR-128): the analytes SHARPIT keeps from a lab report. Each entry names its
 * LOINC code, the unit French labs print first, and the widest values a living adult can show.
 * The plausible range is not a reference range: it only catches a misread (a lost decimal comma
 * turns 1,05 into 105). Reference ranges are the lab's own and travel with each result.
 *
 * shortcut: one unit per marker (the French conventional one), add a unit table when a report
 * from a lab that prints only SI units has to be imported.
 */

export type BloodMarkerEntry = {
  key: string;
  label: string;
  loinc: string;
  unit: string;
  plausible: readonly [min: number, max: number];
};

export const BLOOD_MARKER_CATALOG = [
  { key: 'red_blood_cells', label: 'Hématies', loinc: '789-8', unit: 'T/L', plausible: [1, 9] },
  { key: 'hemoglobin', label: 'Hémoglobine', loinc: '718-7', unit: 'g/dL', plausible: [3, 25] },
  { key: 'hematocrit', label: 'Hématocrite', loinc: '4544-3', unit: '%', plausible: [10, 75] },
  { key: 'mcv', label: 'V.G.M.', loinc: '787-2', unit: 'fL', plausible: [50, 150] },
  { key: 'mch', label: 'T.C.M.H.', loinc: '785-6', unit: 'pg', plausible: [10, 50] },
  { key: 'mchc', label: 'C.C.M.H.', loinc: '786-4', unit: 'g/dL', plausible: [20, 45] },
  { key: 'rdw', label: 'I.D.R.', loinc: '788-0', unit: '%', plausible: [8, 35] },
  {
    key: 'white_blood_cells',
    label: 'Leucocytes',
    loinc: '6690-2',
    unit: 'G/L',
    plausible: [0.1, 200],
  },
  {
    key: 'neutrophils',
    label: 'Polynucléaires neutrophiles',
    loinc: '751-8',
    unit: 'G/L',
    plausible: [0, 100],
  },
  {
    key: 'eosinophils',
    label: 'Polynucléaires éosinophiles',
    loinc: '711-2',
    unit: 'G/L',
    plausible: [0, 30],
  },
  {
    key: 'basophils',
    label: 'Polynucléaires basophiles',
    loinc: '704-7',
    unit: 'G/L',
    plausible: [0, 10],
  },
  { key: 'lymphocytes', label: 'Lymphocytes', loinc: '731-0', unit: 'G/L', plausible: [0, 150] },
  { key: 'monocytes', label: 'Monocytes', loinc: '742-7', unit: 'G/L', plausible: [0, 30] },
  { key: 'platelets', label: 'Plaquettes', loinc: '777-3', unit: 'G/L', plausible: [5, 2000] },
  {
    key: 'mean_platelet_volume',
    label: 'Volume plaquettaire moyen',
    loinc: '32623-1',
    unit: 'fL',
    plausible: [4, 20],
  },
  { key: 'creatinine', label: 'Créatinine', loinc: '2160-0', unit: 'mg/L', plausible: [1, 200] },
  {
    key: 'egfr',
    label: 'DFG estimé (CKD-EPI)',
    loinc: '62238-1',
    unit: 'mL/min/1,73m2',
    plausible: [2, 200],
  },
  { key: 'ferritin', label: 'Ferritine', loinc: '2276-4', unit: 'µg/L', plausible: [1, 10000] },
  { key: 'sodium', label: 'Sodium', loinc: '2951-2', unit: 'mmol/L', plausible: [100, 180] },
  { key: 'potassium', label: 'Potassium', loinc: '2823-3', unit: 'mmol/L', plausible: [1.5, 9] },
  {
    key: 'bilirubin_total',
    label: 'Bilirubine totale',
    loinc: '1975-2',
    unit: 'mg/L',
    plausible: [0.5, 500],
  },
  {
    key: 'alkaline_phosphatase',
    label: 'Phosphatases alcalines',
    loinc: '6768-6',
    unit: 'U/L',
    plausible: [5, 3000],
  },
  { key: 'ast', label: 'ASAT', loinc: '1920-8', unit: 'U/L', plausible: [1, 10000] },
  { key: 'alt', label: 'ALAT', loinc: '1742-6', unit: 'U/L', plausible: [1, 10000] },
  { key: 'ggt', label: 'GGT', loinc: '2324-2', unit: 'U/L', plausible: [1, 5000] },
  {
    key: 'glucose_fasting',
    label: 'Glycémie à jeun',
    loinc: '1558-6',
    unit: 'g/L',
    plausible: [0.2, 10],
  },
  {
    key: 'triglycerides',
    label: 'Triglycérides',
    loinc: '2571-8',
    unit: 'g/L',
    plausible: [0.1, 50],
  },
  {
    key: 'cholesterol_total',
    label: 'Cholestérol total',
    loinc: '2093-3',
    unit: 'g/L',
    plausible: [0.3, 10],
  },
  {
    key: 'cholesterol_hdl',
    label: 'Cholestérol HDL',
    loinc: '2085-9',
    unit: 'g/L',
    plausible: [0.05, 3],
  },
  {
    key: 'cholesterol_non_hdl',
    label: 'Cholestérol non-HDL',
    loinc: '43396-1',
    unit: 'g/L',
    plausible: [0.1, 10],
  },
  {
    key: 'cholesterol_ldl',
    label: 'Cholestérol LDL calculé',
    loinc: '13457-7',
    unit: 'g/L',
    plausible: [0.05, 8],
  },
  { key: 'tsh', label: 'TSH', loinc: '3016-3', unit: 'mUI/L', plausible: [0.001, 500] },
] as const satisfies readonly BloodMarkerEntry[];

export type BloodMarkerKey = (typeof BLOOD_MARKER_CATALOG)[number]['key'];

export const BLOOD_MARKER_KEYS = BLOOD_MARKER_CATALOG.map((entry) => entry.key) as [
  BloodMarkerKey,
  ...BloodMarkerKey[],
];

const BY_KEY = new Map<string, BloodMarkerEntry>(
  BLOOD_MARKER_CATALOG.map((entry) => [entry.key, entry]),
);

export function bloodMarker(key: string): BloodMarkerEntry | undefined {
  return BY_KEY.get(key);
}

/** One result as the lab printed it: its value, and the lab's own reference bounds if any. */
export type BloodMarkerResult = {
  markerKey: BloodMarkerKey;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
};

export type BloodMarkerStatus = 'in_range' | 'low' | 'high' | 'no_reference';

/** Where a value sits against the lab's own bounds — never against a range of ours. */
export function bloodMarkerStatus(
  result: Pick<BloodMarkerResult, 'value' | 'refLow' | 'refHigh'>,
): BloodMarkerStatus {
  if (result.refLow === null && result.refHigh === null) {
    return 'no_reference';
  }
  if (result.refLow !== null && result.value < result.refLow) {
    return 'low';
  }
  if (result.refHigh !== null && result.value > result.refHigh) {
    return 'high';
  }
  return 'in_range';
}
