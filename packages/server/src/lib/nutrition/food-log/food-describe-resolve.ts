import type { FoodProduct } from '@prisma/client';
import {
  FOOD_MATCH_TIER_GENERIC,
  FOOD_MATCH_TIER_OFF,
  FOOD_MATCH_TIER_PERSONAL,
  foodMatchTier,
  rankFoodsByName,
} from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
import { searchCiqualFoods } from './ciqual-search';
import type { FoodDescribeItem } from './food-describe-schema';
import {
  cacheGenericFoods,
  cacheSearchResults,
  searchEatenFoods,
  searchOwnFoods,
} from './food-log-service';
import { searchOffProducts } from './open-food-facts-client';

/** Where a described line was linked, when a product matched. */
export type DescribeMatchSource = 'eaten' | 'own' | 'generic' | 'product';

export type ResolvedDescribedFood = {
  item: FoodDescribeItem;
  product: FoodProduct | null;
  match: DescribeMatchSource | null;
};

/**
 * Link each LLM food line to a known product when the name is a confident match:
 * already eaten → own foods → Ciqual → Open Food Facts. No inventing of custom foods.
 */
export async function resolveDescribedFoods(
  athleteId: string,
  items: FoodDescribeItem[],
): Promise<ResolvedDescribedFood[]> {
  return Promise.all(
    items.map(async (item) => {
      const linked = await resolveDescribedName(athleteId, item.name);
      return { item, product: linked?.product ?? null, match: linked?.match ?? null };
    }),
  );
}

export async function resolveDescribedName(
  athleteId: string,
  name: string,
): Promise<{ product: FoodProduct; match: DescribeMatchSource } | null> {
  const query = name.trim();
  if (query.length < 2) {
    return null;
  }

  const [eaten, own] = await Promise.all([
    searchEatenFoods(athleteId, query),
    searchOwnFoods(athleteId, query),
  ]);
  const eatenHit = pickReliable(
    eaten.map((row) => row.product),
    query,
    FOOD_MATCH_TIER_PERSONAL,
  );
  if (eatenHit) {
    return { product: eatenHit, match: 'eaten' };
  }
  const ownHit = pickReliable(own, query, FOOD_MATCH_TIER_PERSONAL);
  if (ownHit) {
    return { product: ownHit, match: 'own' };
  }

  const generic = await cacheGenericFoods(searchCiqualFoods(query, 5));
  const genericHit = pickReliable(generic, query, FOOD_MATCH_TIER_GENERIC);
  if (genericHit) {
    return { product: genericHit, match: 'generic' };
  }

  try {
    const off = await cacheSearchResults(await searchOffProducts(query, { limit: 5 }));
    const offHit = pickReliable(off, query, FOOD_MATCH_TIER_OFF);
    if (offHit) {
      return { product: offHit, match: 'product' };
    }
  } catch (error) {
    console.error('[food-describe] off search', error);
  }

  return null;
}

function pickReliable(products: FoodProduct[], query: string, minTier: number): FoodProduct | null {
  if (products.length === 0) {
    return null;
  }
  const [best] = rankFoodsByName(query, products);
  if (!best || foodMatchTier(best, query) < minTier) {
    return null;
  }
  return best;
}
