import copyEn from './copy-en.json';

/**
 * English for the server's French copy, applied where it leaves the server (ADR-096): app
 * responses and pushes. The French text is the key — the same convention as the iOS String
 * Catalog — so the hundreds of modules that word things stay as they are, module-level tables
 * included. `{0}`, `{1}`… stand for the parts a template literal fills in; those parts are
 * translated in turn. A string matching no key is tried piece by piece (« · »-separated parts,
 * then sentences), so copy joined from translated pieces still reads in English.
 */
type Template = { pattern: RegExp; english: string; anchor: string; slots: string[] };

// `{0}` for a template literal's parts, `{days}` for the I18nItem resolver's named params.
const SLOT = /\{(\w+)\}/g;
const HAS_SLOT = /\{\w+\}/;
const exact = new Map<string, string>();
const templates: Template[] = [];

for (const [french, english] of Object.entries(copyEn as Record<string, string>)) {
  if (!HAS_SLOT.test(french)) {
    exact.set(french, english);
    continue;
  }
  const pieces = french.split(/\{\w+\}/);
  const source = french
    .split(/(\{\w+\})/)
    .map((piece) =>
      /^\{\w+\}$/.test(piece) ? '(.+?)' : piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  templates.push({
    pattern: new RegExp(`^${source}$`, 's'),
    // Captures come in the French order; English names each slot, wherever it puts it.
    english,
    slots: [...french.matchAll(SLOT)].map((match) => match[1]!),
    anchor: pieces.reduce((a, b) => (b.length > a.length ? b : a), ''),
  });
}
// Longest anchors first: the most specific template wins.
templates.sort((a, b) => b.anchor.length - a.anchor.length);

const SEGMENT = /( · | — |(?<=[.!?…])\s+)/;
const cache = new Map<string, string>();
const CACHE_LIMIT = 20_000;

function whole(text: string, depth: number): string | undefined {
  const known = exact.get(text);
  if (known !== undefined) {
    return known;
  }
  if (depth > 3) {
    return undefined;
  }
  for (const template of templates) {
    if (!text.includes(template.anchor)) {
      continue;
    }
    const match = template.pattern.exec(text);
    // A slot holds a figure, a name or a short phrase — never a sentence: a template with a
    // one-word anchor (« {0} séance{1} ») must not swallow a paragraph.
    if (match && match.slice(1).every(isSlotValue)) {
      const parts = match.slice(1).map((part) => translate(part, depth + 1));
      return template.english.replace(
        SLOT,
        (_, name: string) => parts[template.slots.indexOf(name)] ?? '',
      );
    }
  }
  return undefined;
}

const MAX_SLOT = 40;

function isSlotValue(part: string): boolean {
  return part.length <= MAX_SLOT && !/[.!?…]\s/.test(part);
}

function translate(text: string, depth: number): string {
  const found = whole(text, depth);
  if (found !== undefined) {
    return found;
  }
  if (!SEGMENT.test(text)) {
    return text;
  }
  return text
    .split(SEGMENT)
    .map((piece) => (SEGMENT.test(piece) ? piece : (whole(piece, depth) ?? piece)))
    .join('');
}

// Dates are formatted in French across the code (date-fns `fr`, `Intl` 'fr-FR'): their words are
// swapped here, only next to a day number or standing as a weekday, so « mars » alone stays put.
const MONTHS: Record<string, string> = {
  'janv.': 'Jan',
  janvier: 'January',
  'févr.': 'Feb',
  février: 'February',
  mars: 'March',
  'avr.': 'Apr',
  avril: 'April',
  mai: 'May',
  juin: 'June',
  'juil.': 'Jul',
  juillet: 'July',
  août: 'August',
  'sept.': 'Sept',
  septembre: 'September',
  'oct.': 'Oct',
  octobre: 'October',
  'nov.': 'Nov',
  novembre: 'November',
  'déc.': 'Dec',
  décembre: 'December',
};
const WEEKDAYS: Record<string, string> = {
  lundi: 'Monday',
  mardi: 'Tuesday',
  mercredi: 'Wednesday',
  jeudi: 'Thursday',
  vendredi: 'Friday',
  samedi: 'Saturday',
  dimanche: 'Sunday',
  'lun.': 'Mon',
  'mar.': 'Tue',
  'mer.': 'Wed',
  'jeu.': 'Thu',
  'ven.': 'Fri',
  'sam.': 'Sat',
  'dim.': 'Sun',
};
const MONTH_AFTER_DAY = new RegExp(
  `(\\d{1,2})(?:er)? (${Object.keys(MONTHS)
    .map((m) => m.replace('.', '\\.'))
    .join('|')})(?![\\p{L}])`,
  'giu',
);
const WEEKDAY = new RegExp(
  `(?<![\\p{L}])(${Object.keys(WEEKDAYS)
    .map((d) => d.replace('.', '\\.'))
    .join('|')})(?![\\p{L}])`,
  'giu',
);

function englishDates(text: string): string {
  return text
    .replace(
      MONTH_AFTER_DAY,
      (_, day: string, month: string) => `${day} ${MONTHS[month.toLowerCase()] ?? month}`,
    )
    .replace(WEEKDAY, (word: string) => WEEKDAYS[word.toLowerCase()] ?? word);
}

/** One string in English; itself when nothing in it is known copy. */
export function englishCopy(text: string): string {
  if (text.length < 2 || !/[A-Za-zÀ-ÿ]/.test(text)) {
    return text;
  }
  const cached = cache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const translated = englishDates(translate(text, 0));
  if (cache.size >= CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(text, translated);
  return translated;
}

/** Every string inside a JSON value, in English. Keys are left alone: they are the contract. */
export function englishDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return englishCopy(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(englishDeep) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, englishDeep(inner)]),
    ) as T;
  }
  return value;
}
