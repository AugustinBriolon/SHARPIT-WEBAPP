import {
  isBarcode,
  mapOffProduct,
  OFF_FIELDS,
  type MappedFood,
  type OffProduct,
} from '@sharpit/app/lib/nutrition/food-log/open-food-facts';
import { rankFoodsByName } from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';

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

/**
 * French-first search, keeping only products the log can use, best name match first (ADR-064).
 * A search hit lacks the additive list: its score is a summary until the product is opened.
 */
export async function searchOffProducts(
  query: string,
  { limit = 20, fetcher = fetch }: { limit?: number; fetcher?: Fetch } = {},
): Promise<MappedFood[]> {
  const params = new URLSearchParams({
    q: query,
    langs: 'fr,en',
    page_size: String(limit * CANDIDATES_PER_RESULT),
    fields: OFF_FIELDS.join(','),
  });
  const body = (await getJson(`${SEARCH_URL}?${params}`, fetcher)) as {
    hits?: OffProduct[];
  } | null;
  const foods = (body?.hits ?? [])
    .map((hit) => mapOffProduct(hit, 'summary'))
    .filter((food): food is MappedFood => food !== null);
  return rankFoodsByName(query, foods).slice(0, limit);
}
