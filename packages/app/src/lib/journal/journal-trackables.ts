/**
 * Built-in journal trackables — stable IDs for longitudinal collection.
 *
 * Intent: athletes opt into sparse day signals now so later presentation-layer
 * analytics can correlate practices/consumption with recovery, sleep, and form.
 * Do not rename IDs once shipped. Custom items use `custom_*` ids in the same
 * AthleteDayJournal.factors JSON bag.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlarmClock,
  Baby,
  Ban,
  Battery,
  Bean,
  BedDouble,
  Bone,
  Brain,
  Car,
  Candy,
  Cat,
  Cigarette,
  CircleAlert,
  CircleDot,
  CloudRain,
  Coffee,
  Croissant,
  Droplets,
  Dumbbell,
  EarOff,
  EyeOff,
  Flame,
  Flower2,
  Footprints,
  Hand,
  Heart,
  HeartPulse,
  Leaf,
  MilkOff,
  Monitor,
  Moon,
  PersonStanding,
  Pill,
  Salad,
  Smile,
  Snowflake,
  Sparkles,
  Stethoscope,
  Sun,
  Syringe,
  Tablet,
  Thermometer,
  Users,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Waves,
  Wine,
  Zap,
} from 'lucide-react';

/** Filter chips in the personalize drawer. */
export const JOURNAL_FILTER_IDS = [
  'all',
  'automatique',
  'sante',
  'medicament',
  'nutrition',
  'complement',
  'sommeil',
  'style_vie',
  'comportement',
  'bien_etre',
  'personnalise',
] as const;

export type JournalFilterId = (typeof JOURNAL_FILTER_IDS)[number];

/** Query param other surfaces use to open the personalize drawer on one filter. */
export const JOURNAL_PREFS_DEEP_LINK_PARAM = 'personnaliser';

/** `?personnaliser=nutrition` → 'nutrition'; anything else → null. */
export function journalPrefsDeepLinkFilter(search: string): JournalFilterId | null {
  const value = new URLSearchParams(search).get(JOURNAL_PREFS_DEEP_LINK_PARAM);
  return JOURNAL_FILTER_IDS.find((id) => id === value) ?? null;
}

export const JOURNAL_FILTER_LABELS: Record<JournalFilterId, string> = {
  all: 'Tous',
  automatique: 'Automatique',
  sante: 'État de santé',
  medicament: 'Médicament',
  nutrition: 'Nutrition',
  complement: 'Complément',
  sommeil: 'Sommeil',
  style_vie: 'Style de vie',
  comportement: 'Comportement',
  bien_etre: 'Bien-être',
  personnalise: 'Personnalisé',
};

export type JournalTrackableKind =
  | 'auto'
  | 'factor'
  | 'metric_caffeine'
  | 'metric_mood'
  | 'metric_hydration'
  | 'metric_driving'
  | 'nutrition_panel'
  | 'diet';

export type JournalTrackableCategory = Exclude<JournalFilterId, 'all' | 'personnalise'>;

export type JournalBuiltinTrackableId =
  | 'metric_caffeine'
  | 'metric_mood'
  | 'metric_hydration'
  | 'metric_driving'
  | 'late_meal'
  | 'device_in_bed'
  | 'steps_10k'
  | 'stress_ok'
  | 'nap'
  | 'cardio_20'
  | 'strength_20'
  | 'sleep_target'
  | 'body_battery_ok'
  | 'hydration_sync'
  | 'outdoor_minutes'
  | 'nutrition_panel'
  | 'added_sugar'
  | 'alcohol'
  | 'fever'
  | 'menstruation'
  | 'tobacco'
  | 'headache'
  | 'pain'
  | 'allergies'
  | 'cold_congestion'
  | 'cramps'
  | 'abdominal_cramps'
  | 'contraception'
  | 'sexual_activity'
  | 'pregnant'
  | 'medication'
  | 'antibiotic'
  | 'sauna'
  | 'intermittent_fasting'
  | 'cold_shower'
  | 'cupping'
  | 'ice_bath'
  | 'chiropractor'
  | 'yoga'
  | 'cbd'
  | 'sun_exposure'
  | 'massage'
  | 'mobility'
  | 'meditation'
  | 'easy_walk'
  | 'pneumatic_recovery'
  | 'meal_out'
  | 'skipped_meal'
  | 'night_work'
  | 'shared_bed'
  | 'earplugs'
  | 'sleep_mask'
  | 'pet_in_room'
  | 'melatonin'
  | 'omega3'
  | 'creatine'
  | 'vitamin_d'
  | 'magnesium'
  | 'ashwagandha'
  | 'multivitamin'
  | 'zinc'
  | 'probiotic'
  | 'electrolytes'
  | 'collagen'
  | 'protein_powder'
  | 'hydration_quality'
  | 'diet_low_carb'
  | 'diet_gluten_free'
  | 'diet_keto'
  | 'diet_dairy_free'
  | 'diet_vegetarian'
  | 'diet_vegan';

export type JournalBuiltinTrackable = {
  id: JournalBuiltinTrackableId;
  label: string;
  category: JournalTrackableCategory;
  kind: JournalTrackableKind;
  icon: LucideIcon;
  factorId?: string;
  autoId?: string;
  dietId?: string;
};

function auto(
  id: JournalBuiltinTrackableId,
  label: string,
  icon: LucideIcon,
  autoId: string,
): JournalBuiltinTrackable {
  return { id, label, category: 'automatique', kind: 'auto', icon, autoId };
}

function factor({
  id,
  label,
  category,
  icon,
  factorId,
}: {
  id: JournalBuiltinTrackableId;
  label: string;
  category: JournalTrackableCategory;
  icon: LucideIcon;
  factorId?: string;
}): JournalBuiltinTrackable {
  return { id, label, category, kind: 'factor', icon, factorId: factorId ?? id };
}

function diet(
  id: JournalBuiltinTrackableId,
  label: string,
  icon: LucideIcon,
  dietId: string,
): JournalBuiltinTrackable {
  return { id, label, category: 'nutrition', kind: 'diet', icon, dietId };
}

export const JOURNAL_BUILTIN_TRACKABLES: readonly JournalBuiltinTrackable[] = [
  // Bien-être metrics (day basics)
  {
    id: 'metric_caffeine',
    label: 'Caféine',
    category: 'bien_etre',
    kind: 'metric_caffeine',
    icon: Coffee,
  },
  {
    id: 'metric_mood',
    label: 'Humeur',
    category: 'bien_etre',
    kind: 'metric_mood',
    icon: Smile,
  },
  {
    id: 'metric_hydration',
    label: 'Hydratation',
    category: 'bien_etre',
    kind: 'metric_hydration',
    icon: Droplets,
  },
  {
    id: 'metric_driving',
    label: 'Conduite',
    category: 'style_vie',
    kind: 'metric_driving',
    icon: Car,
  },

  // Automatique
  auto('steps_10k', 'Pas (objectif)', Footprints, 'steps_10k'),
  auto('stress_ok', 'Stress sous cible', HeartPulse, 'stress_ok'),
  auto('nap', 'Sieste', Moon, 'nap'),
  auto('cardio_20', 'Cardio ≥ 20 min', Activity, 'cardio_20'),
  auto('strength_20', 'Force ≥ 20 min', Dumbbell, 'strength_20'),
  auto('sleep_target', 'Sommeil ≥ cible', BedDouble, 'sleep_target'),
  auto('body_battery_ok', 'Body Battery', Battery, 'body_battery_ok'),
  auto('hydration_sync', 'Hydratation (sync)', Droplets, 'hydration_sync'),
  auto('outdoor_minutes', 'Temps outdoor', Sun, 'outdoor_minutes'),

  // État de santé
  factor({ id: 'fever', label: 'Fièvre', category: 'sante', icon: Thermometer }),
  factor({ id: 'menstruation', label: 'Menstruation', category: 'sante', icon: CircleDot }),
  factor({ id: 'tobacco', label: 'Tabac', category: 'sante', icon: Cigarette }),
  factor({ id: 'headache', label: 'Maux de tête', category: 'sante', icon: CircleAlert }),
  factor({ id: 'pain', label: 'Douleur', category: 'sante', icon: Bone }),
  factor({ id: 'allergies', label: 'Allergies', category: 'sante', icon: CloudRain }),
  factor({
    id: 'cold_congestion',
    label: 'Rhume / congestion',
    category: 'sante',
    icon: CloudRain,
  }),
  factor({ id: 'cramps', label: 'Crampes', category: 'sante', icon: Zap }),
  factor({
    id: 'abdominal_cramps',
    label: 'Crampes abdominales',
    category: 'sante',
    icon: CircleAlert,
  }),
  factor({ id: 'pregnant', label: 'Enceinte', category: 'sante', icon: Baby }),
  factor({ id: 'sexual_activity', label: 'Activité sexuelle', category: 'sante', icon: Heart }),

  // Médicament
  factor({ id: 'medication', label: 'Médicament', category: 'medicament', icon: Tablet }),
  factor({ id: 'antibiotic', label: 'Antibiotique', category: 'medicament', icon: Syringe }),
  factor({ id: 'contraception', label: 'Contraception', category: 'medicament', icon: Pill }),
  factor({ id: 'cbd', label: 'CBD', category: 'medicament', icon: Leaf }),

  // Nutrition
  {
    id: 'nutrition_panel',
    label: 'Nutrition (lecture)',
    category: 'nutrition',
    kind: 'nutrition_panel',
    icon: Salad,
  },
  factor({ id: 'added_sugar', label: 'Sucre ajouté', category: 'nutrition', icon: Candy }),
  factor({ id: 'alcohol', label: 'Alcool', category: 'nutrition', icon: Wine }),
  factor({ id: 'meal_out', label: 'Repas hors domicile', category: 'nutrition', icon: Utensils }),
  factor({
    id: 'skipped_meal',
    label: 'Repas sauté',
    category: 'nutrition',
    icon: UtensilsCrossed,
  }),
  diet('diet_low_carb', 'Pauvre en glucides', Croissant, 'low_carb'),
  diet('diet_keto', 'Cétogène', Bean, 'keto'),
  diet('diet_gluten_free', 'Sans gluten', Ban, 'gluten_free'),
  diet('diet_dairy_free', 'Sans produits laitiers', MilkOff, 'dairy_free'),
  diet('diet_vegetarian', 'Végétarien', Leaf, 'vegetarian'),
  diet('diet_vegan', 'Végétalien', Vegan, 'vegan'),

  // Compléments
  factor({ id: 'omega3', label: 'Oméga-3', category: 'complement', icon: Pill }),
  factor({ id: 'creatine', label: 'Créatine', category: 'complement', icon: Pill }),
  factor({ id: 'vitamin_d', label: 'Vitamine D', category: 'complement', icon: Pill }),
  factor({ id: 'magnesium', label: 'Magnésium', category: 'complement', icon: Pill }),
  factor({ id: 'ashwagandha', label: 'Ashwagandha', category: 'complement', icon: Pill }),
  factor({ id: 'multivitamin', label: 'Multivitamines', category: 'complement', icon: Pill }),
  factor({ id: 'zinc', label: 'Zinc', category: 'complement', icon: Pill }),
  factor({ id: 'probiotic', label: 'Probiotique', category: 'complement', icon: Pill }),
  factor({ id: 'electrolytes', label: 'Électrolytes', category: 'complement', icon: Droplets }),
  factor({ id: 'collagen', label: 'Collagène', category: 'complement', icon: Pill }),
  factor({ id: 'protein_powder', label: 'Protéine en poudre', category: 'complement', icon: Pill }),
  factor({
    id: 'hydration_quality',
    label: 'Bonne hydratation (ressenti)',
    category: 'complement',
    icon: Droplets,
  }),

  // Sommeil
  factor({ id: 'late_meal', label: 'Repas tardif', category: 'sommeil', icon: UtensilsCrossed }),
  factor({ id: 'device_in_bed', label: 'Écran au lit', category: 'sommeil', icon: Monitor }),
  factor({ id: 'shared_bed', label: 'Lit partagé', category: 'sommeil', icon: Users }),
  factor({ id: 'earplugs', label: 'Bouchons d’oreille', category: 'sommeil', icon: EarOff }),
  factor({ id: 'sleep_mask', label: 'Masque de sommeil', category: 'sommeil', icon: EyeOff }),
  factor({ id: 'pet_in_room', label: 'Animal dans la chambre', category: 'sommeil', icon: Cat }),
  factor({ id: 'melatonin', label: 'Mélatonine', category: 'sommeil', icon: Moon }),

  // Style de vie
  factor({
    id: 'intermittent_fasting',
    label: 'Jeûne intermittent',
    category: 'style_vie',
    icon: AlarmClock,
  }),
  factor({ id: 'sun_exposure', label: 'Exposition au soleil', category: 'style_vie', icon: Sun }),
  factor({ id: 'massage', label: 'Massage', category: 'style_vie', icon: Hand }),
  factor({
    id: 'mobility',
    label: 'Étirements / mobilité',
    category: 'style_vie',
    icon: PersonStanding,
  }),
  factor({ id: 'meditation', label: 'Méditation', category: 'style_vie', icon: Brain }),
  factor({ id: 'easy_walk', label: 'Marche légère', category: 'style_vie', icon: Footprints }),
  factor({
    id: 'pneumatic_recovery',
    label: 'Récupération pneumatique',
    category: 'style_vie',
    icon: Waves,
  }),

  // Comportement
  factor({ id: 'night_work', label: 'Travail de nuit', category: 'comportement', icon: Moon }),

  // Bien-être (pratiques récup)
  factor({ id: 'sauna', label: 'Sauna', category: 'bien_etre', icon: Flame }),
  factor({ id: 'cold_shower', label: 'Douche froide', category: 'bien_etre', icon: Snowflake }),
  factor({ id: 'ice_bath', label: 'Bain de glace', category: 'bien_etre', icon: Snowflake }),
  factor({ id: 'cupping', label: 'Cupping', category: 'bien_etre', icon: Bone }),
  factor({ id: 'chiropractor', label: 'Chiropracteur', category: 'bien_etre', icon: Stethoscope }),
  factor({ id: 'yoga', label: 'Yoga', category: 'bien_etre', icon: Flower2 }),
] as const;

export const JOURNAL_BUILTIN_TRACKABLE_IDS = JOURNAL_BUILTIN_TRACKABLES.map(
  (item) => item.id,
) as JournalBuiltinTrackableId[];

const BY_ID = new Map(JOURNAL_BUILTIN_TRACKABLES.map((item) => [item.id, item]));

export function journalTrackableById(id: string): JournalBuiltinTrackable | undefined {
  return BY_ID.get(id as JournalBuiltinTrackableId);
}

export function isCustomTrackableId(id: string): boolean {
  return /^custom_[a-zA-Z0-9_-]{4,64}$/.test(id);
}

export function createCustomTrackableId(): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `custom_${suffix}`;
}

export const CUSTOM_FACTOR_ICON = Sparkles;
