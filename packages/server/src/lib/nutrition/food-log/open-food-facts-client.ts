import {
  isBarcode,
  mapOffProduct,
  OFF_FIELDS,
  type MappedFood,
  type OffProduct,
} from '@sharpit/app/lib/nutrition/food-log/open-food-facts';
import {
  dedupeFoods,
  normalizeFoodText,
  rankFoodsByName,
} from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
import { produceFirst } from './ciqual-search';

/**
 * Open Food Facts, read from the server only (ADR-061): the athlete's device never calls OFF,
 * so OFF sees SHARPIT's servers, never who scanned what. OFF asks every client to name itself.
 */
const USER_AGENT = 'SHARPIT/1.0 (augustin.briolon@gmail.com)';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
/** Vercel → OFF is often fine in tens of ms, but cold paths and OFF hiccups regularly pass 6 s. */
const TIMEOUT_MS = 12_000;
/** One more try after a timeout: the second call usually lands while the first was stalling. */
const TIMEOUT_RETRIES = 1;

type Fetch = typeof fetch;

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

async function getJson(url: string, fetcher: Fetch): Promise<unknown | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TIMEOUT_RETRIES; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Open Food Facts answered ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === TIMEOUT_RETRIES) {
        throw error;
      }
    }
  }
  throw lastError;
}

/** The product behind a barcode, or null when OFF does not know it or knows it too poorly. */
export async function fetchOffProduct(
  barcode: string,
  fetcher: Fetch = fetch,
): Promise<MappedFood | null> {
  if (!isBarcode(barcode)) {
    return null;
  }
  const url = `${PRODUCT_URL}/${barcode}.json?fields=${OFF_FIELDS.join(',')}`;
  const body = (await getJson(url, fetcher)) as { status?: number; product?: OffProduct } | null;
  if (!body?.product || body.status === 0) {
    return null;
  }
  return mapOffProduct({ ...body.product, code: body.product.code ?? barcode });
}

/** OFF ranks by popularity: ask for twice what is shown, so the plain product can rise. */
const CANDIDATES_PER_RESULT = 2;

/** Among names that read alike, a product whose data the manufacturer gave or a moderator checked. */
function verifiedFirst(food: MappedFood): number {
  return food.verification ? 1 : 0;
}

/** Then a full label, then a product sold in France; OFF's own order (popularity) breaks ties. */
function labelQuality(food: MappedFood): number {
  return (food.quality.labelComplete ? 2 : 0) + (food.quality.soldInFrance ? 1 : 0);
}

/** Words that never name a brand: probing them only costs OFF a call. */
const NOT_A_BRAND = new Set([
  'aux',
  'avec',
  'sans',
  'les',
  'des',
  'une',
  'pour',
  'sur',
  'par',
  'and',
  'the',
  'with',
]);

/**
 * OFF's free-text search weighs every word on its own and boosts categories, so « club spicy
 * reghalal » opens on British sandwiches (« club » reads as the sandwich) and the brand's own
 * products sit past the fiftieth hit. A brand is usually typed first or last: each of those words
 * is also asked as the brand, the other words required (`brands:reghalal AND club AND spicy`). A
 * word that names no brand finds little, and the name ranking sorts whatever it finds.
 */
export function brandProbeQueries(query: string): string[] {
  const words = normalizeFoodText(query)
    .split(' ')
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !NOT_A_BRAND.has(word));
  if (words.length < 2) {
    return [];
  }
  const brands = [...new Set([words.at(-1)!, words[0]!])];
  return brands.map((brand) =>
    [`brands:${brand}`, ...words.filter((word) => word !== brand)].join(' AND '),
  );
}

async function searchHits(q: string, pageSize: number, fetcher: Fetch): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    q,
    langs: 'fr,en',
    page_size: String(pageSize),
    fields: OFF_FIELDS.join(','),
  });
  const body = (await getJson(`${SEARCH_URL}?${params}`, fetcher)) as {
    hits?: OffProduct[];
  } | null;
  return body?.hits ?? [];
}

/** One hit per barcode, the first kept: a brand probe and the plain query often find the same. */
function uniqueByCode(hits: OffProduct[]): OffProduct[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (!hit.code) {
      return true;
    }
    if (seen.has(hit.code)) {
      return false;
    }
    seen.add(hit.code);
    return true;
  });
}

/**
 * French-first search, keeping only products the log can use, best name match first (ADR-064),
 * verified and complete products first among alike names, duplicates merged (ADR-069). The words
 * typed first and last are also asked as the brand (`brandProbeQueries`, ADR-136): their hits come
 * before the plain query's, and a failed probe never fails the search — only the plain query does.
 * A search hit lacks the additive list: its score is a summary until the product is opened.
 */
export async function searchOffProducts(
  query: string,
  { limit = 20, fetcher = fetch }: { limit?: number; fetcher?: Fetch } = {},
): Promise<MappedFood[]> {
  const pageSize = limit * CANDIDATES_PER_RESULT;
  const [plain, ...probes] = await Promise.all([
    searchHits(query, pageSize, fetcher),
    ...brandProbeQueries(query).map((probe) =>
      searchHits(probe, pageSize, fetcher).catch((error: unknown) => {
        console.warn('[off] brand probe failed', error);
        return [];
      }),
    ),
  ]);
  const foods = uniqueByCode([...probes.flat(), ...plain])
    .map((hit) => mapOffProduct(hit, 'summary'))
    .filter((food): food is MappedFood => food !== null);
  const ranked = rankFoodsByName(query, foods, {
    preference: verifiedFirst,
    quality: labelQuality,
  });
  return produceFirst(query, dedupeFoods(ranked)).slice(0, limit);
}
