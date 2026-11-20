import type { EntityManager } from '@mikro-orm/postgresql';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { CategoryTranslationEntity } from '~/domains/category/infra/persistence/entities/category-translation.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductTranslationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-translation.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import {
  buildCategoryTranslationPathKey,
  categoryTranslationSeeds,
  type CategoryTranslationSeed,
} from './category-translation.seed-loader';
import {
  buildProductTranslationIdentityKey,
  productTranslationSeeds,
  type ProductTranslationSeed,
} from './product-translation.seed-loader';

type ResolvedCategoryTranslation = {
  seed: CategoryTranslationSeed;
  category: CategoryEntity;
};

type ResolvedProductTranslation = {
  seed: ProductTranslationSeed;
  product: ProductEntity;
};

async function resolveProductTranslations(
  em: EntityManager,
  seeds: ProductTranslationSeed[],
): Promise<ResolvedProductTranslation[]> {
  const shopSlugs = [...new Set(seeds.map((seed) => seed.shopSlug))];
  const shops = await em.find(ShopEntity, { slug: { $in: shopSlugs } });
  const shopSlugsInDatabase = new Set(shops.map((shop) => shop.slug));

  for (const seed of seeds) {
    if (!shopSlugsInDatabase.has(seed.shopSlug)) {
      throw new Error(`Missing seeded shop for product translation seed ${seed.shopSlug}`);
    }
  }

  const products = await em.find(
    ProductEntity,
    { shop: { $in: shops } },
    { populate: ['shop'] },
  );
  const productsByIdentity = new Map(
    products.map((product) => [
      buildProductTranslationIdentityKey(product.shop.slug, product.title),
      product,
    ]),
  );

  return seeds.map((seed) => {
    const product = productsByIdentity.get(
      buildProductTranslationIdentityKey(seed.shopSlug, seed.productTitle),
    );

    if (!product) {
      throw new Error(
        `Missing seeded product for translation seed "${seed.productTitle}" at "${seed.shopSlug}"`,
      );
    }

    return { seed, product };
  });
}

async function resolveCategoryTranslations(
  em: EntityManager,
  seeds: CategoryTranslationSeed[],
): Promise<ResolvedCategoryTranslation[]> {
  const categoriesByPath = new Map<string, CategoryEntity>();

  for (const seed of seeds) {
    const pathKey = buildCategoryTranslationPathKey(seed.categoryPath);

    if (categoriesByPath.has(pathKey)) {
      continue;
    }

    let parent: CategoryEntity | null = null;
    let category: CategoryEntity | null = null;

    for (const name of seed.categoryPath) {
      category = await em.findOne(CategoryEntity, { name, parent: parent ?? null });

      if (!category) {
        throw new Error(`Missing seeded category path: ${pathKey}`);
      }

      parent = category;
    }

    if (!category) {
      throw new Error(`Missing seeded category path: ${pathKey}`);
    }

    categoriesByPath.set(pathKey, category);
  }

  return seeds.map((seed) => {
    const category = categoriesByPath.get(
      buildCategoryTranslationPathKey(seed.categoryPath),
    );

    if (!category) {
      throw new Error(
        `Missing seeded category path: ${buildCategoryTranslationPathKey(seed.categoryPath)}`,
      );
    }

    return { seed, category };
  });
}

export async function seedProductTranslations(
  em: EntityManager,
  seeds: ProductTranslationSeed[] = productTranslationSeeds,
): Promise<void> {
  if (seeds.length === 0) {
    return;
  }

  const resolved = await resolveProductTranslations(em, seeds);
  console.log(`[seed][product-translations] Upserting ${resolved.length} rows`);
  const existingTranslations = await em.find(
    ProductTranslationEntity,
    {
      product: { $in: [...new Set(resolved.map(({ product }) => product))] },
      language: { $in: [...new Set(seeds.map((seed) => seed.language))] },
    },
    { populate: ['product'] },
  );
  const existingByKey = new Map(
    existingTranslations.map((translation) => [
      `${translation.product.id}::${translation.language}`,
      translation,
    ]),
  );

  for (const { seed, product } of resolved) {
    const key = `${product.id}::${seed.language}`;
    const translation =
      existingByKey.get(key) ??
      em.create(ProductTranslationEntity, {
        product,
        language: seed.language,
        title: seed.title,
        description: seed.description,
      });

    translation.title = seed.title;
    translation.description = seed.description;
    existingByKey.set(key, translation);
    em.persist(translation);
  }

  await em.flush();
  console.log(`[seed][product-translations] Upserted ${resolved.length} rows`);
}

export async function seedCategoryTranslations(
  em: EntityManager,
  seeds: CategoryTranslationSeed[] = categoryTranslationSeeds,
): Promise<void> {
  if (seeds.length === 0) {
    return;
  }

  const resolved = await resolveCategoryTranslations(em, seeds);
  console.log(`[seed][category-translations] Upserting ${resolved.length} rows`);
  const existingTranslations = await em.find(
    CategoryTranslationEntity,
    {
      category: { $in: [...new Set(resolved.map(({ category }) => category))] },
      language: { $in: [...new Set(seeds.map((seed) => seed.language))] },
    },
    { populate: ['category'] },
  );
  const existingByKey = new Map(
    existingTranslations.map((translation) => [
      `${translation.category.id}::${translation.language}`,
      translation,
    ]),
  );

  for (const { seed, category } of resolved) {
    const key = `${category.id}::${seed.language}`;
    const translation =
      existingByKey.get(key) ??
      em.create(CategoryTranslationEntity, {
        category,
        language: seed.language,
        name: seed.name,
      });

    translation.name = seed.name;
    existingByKey.set(key, translation);
    em.persist(translation);
  }

  await em.flush();
  console.log(`[seed][category-translations] Upserted ${resolved.length} rows`);
}

/**
 * Loads and validates the curated translation seed files without touching the
 * database. `just seed-validate` runs this before any seed step writes data.
 */
export function validateLocalizedContentSeeds(): void {
  console.log(
    `[seed][translations] Validated ${productTranslationSeeds.length} product rows and ${categoryTranslationSeeds.length} category rows`,
  );
}
