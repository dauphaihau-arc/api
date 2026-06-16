import type { EntityManager } from '@mikro-orm/postgresql';
import type { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/entities/product.entity';
import { ProductViewHistoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-view-history.entity';
import {
  PRODUCT_VIEW_HISTORY_LOCAL_TSV_PATH,
  PRODUCT_VIEW_HISTORY_TSV_PATH
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type ProductViewHistorySeed = {
  shopSlug: string;
  productTitle: string;
  userEmail?: string;
  guestSessionId?: string;
  viewedAt: Date;
};

type ProductViewHistorySeedRow = {
  shop_slug: string;
  product_title: string;
  user_email: string;
  guest_session_id: string;
  guest_session_prefix: string;
  guest_session_count: string;
  viewed_at: string;
  viewed_at_step_minutes: string;
};

function parseOptionalPositiveInteger(
  value: string,
  fieldName: string,
  seedKey: string
): number | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} "${value}" for product view history seed ${seedKey}`);
  }

  return parsed;
}

function padSequence(value: number): string {
  return String(value).padStart(3, '0');
}

function parseViewedAt(value: string, seedKey: string): Date {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Missing viewed_at for product view history seed ${seedKey}`);
  }

  const viewedAt = new Date(normalized);
  if (Number.isNaN(viewedAt.getTime())) {
    throw new Error(`Invalid viewed_at "${value}" for product view history seed ${seedKey}`);
  }

  return viewedAt;
}

function loadProductViewHistorySeeds(): ProductViewHistorySeed[] {
  return [
    ...readTsvRows<ProductViewHistorySeedRow>(PRODUCT_VIEW_HISTORY_TSV_PATH),
    ...readOptionalTsvRows<ProductViewHistorySeedRow>(PRODUCT_VIEW_HISTORY_LOCAL_TSV_PATH),
  ].flatMap<ProductViewHistorySeed>((row, index) => {
    const shopSlug = row.shop_slug.trim();
    const productTitle = row.product_title.trim();
    const userEmail = row.user_email.trim() || undefined;
    const guestSessionId = row.guest_session_id.trim() || undefined;
    const guestSessionPrefix = row.guest_session_prefix.trim() || undefined;
    const seedKey = `${shopSlug}::${productTitle}#${index + 2}`;
    const guestSessionCount = parseOptionalPositiveInteger(
      row.guest_session_count,
      'guest_session_count',
      seedKey
    );
    const viewedAt = parseViewedAt(row.viewed_at, seedKey);
    const viewedAtStepMinutes = parseOptionalPositiveInteger(
      row.viewed_at_step_minutes,
      'viewed_at_step_minutes',
      seedKey
    ) ?? 5;

    if (!shopSlug) {
      throw new Error(`Missing shop_slug for product view history seed row ${index + 2}`);
    }

    if (!productTitle) {
      throw new Error(`Missing product_title for product view history seed ${seedKey}`);
    }

    if (guestSessionId && (guestSessionPrefix || guestSessionCount)) {
      throw new Error(
        `Product view history seed ${seedKey} cannot mix guest_session_id with guest_session_prefix or guest_session_count`
      );
    }

    if (userEmail && (guestSessionId || guestSessionPrefix || guestSessionCount)) {
      throw new Error(
        `Product view history seed ${seedKey} cannot mix user_email with guest session fields`
      );
    }

    if (userEmail) {
      return [{
        shopSlug,
        productTitle,
        userEmail,
        viewedAt,
      }];
    }

    if (guestSessionId) {
      return [{
        shopSlug,
        productTitle,
        guestSessionId,
        viewedAt,
      }];
    }

    if (!guestSessionPrefix || !guestSessionCount) {
      throw new Error(
        `Product view history seed ${seedKey} must define user_email, guest_session_id, or guest_session_prefix with guest_session_count`
      );
    }

    return Array.from({ length: guestSessionCount }, (_row, offset) => ({
      shopSlug,
      productTitle,
      guestSessionId: `${guestSessionPrefix}${padSequence(offset + 1)}`,
      viewedAt: new Date(viewedAt.getTime() + (offset * viewedAtStepMinutes * 60 * 1000)),
    }));
  });
}

export async function seedProductViewHistory(
  em: EntityManager,
  usersByEmail: Map<string, CurrentUserEntity>
): Promise<void> {
  const seeds = loadProductViewHistorySeeds();

  for (const seed of seeds) {
    const product = await em.findOne(ProductEntity, {
      title: seed.productTitle,
      shop: { slug: seed.shopSlug },
    });

    if (!product) {
      throw new Error(
        `Missing seeded product for product view history: ${seed.shopSlug}::${seed.productTitle}`
      );
    }

    const user = seed.userEmail ? usersByEmail.get(seed.userEmail) : undefined;
    if (seed.userEmail && !user) {
      throw new Error(`Missing seeded user for product view history: ${seed.userEmail}`);
    }

    const existing = seed.userEmail
      ? await em.findOne(ProductViewHistoryEntity, { product, user })
      : await em.findOne(ProductViewHistoryEntity, { product, guestSessionId: seed.guestSessionId });

    const record = existing ?? em.create(ProductViewHistoryEntity, {
      product,
      user,
      guestSessionId: seed.guestSessionId,
      viewedAt: seed.viewedAt,
    });

    record.product = product;
    record.user = user;
    record.guestSessionId = seed.guestSessionId;
    record.viewedAt = seed.viewedAt;
    em.persist(record);
  }

  await em.flush();
}
