import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { CategoryAttributeOptionEntity } from '~/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { CouponUsageEntity } from '~/domains/coupon/infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '~/domains/coupon/infra/persistence/entities/coupon.entity';
import { UserCredentialEntity } from '~/domains/auth/infra/persistence/entities/user-credential.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CartEntity } from '~/domains/cart/infra/persistence/entities/cart.entity';
import { CartItemEntity } from '~/domains/cart/infra/persistence/entities/cart-item.entity';
import { ChatConversationEntity } from '~/domains/chat/infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '~/domains/chat/infra/persistence/entities/chat-message.entity';
import { EmailVerificationTokenEntity } from '~/domains/auth/infra/persistence/entities/email-verification-token.entity';
import { PasswordResetTokenEntity } from '~/domains/auth/infra/persistence/entities/password-reset-token.entity';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { UserRoleEntity } from '~/domains/auth/infra/persistence/entities/user-role.entity';
import { UserPreferenceEntity } from '~/domains/auth/infra/persistence/entities/user-preference.entity';
import { UserSessionEntity } from '~/domains/auth/infra/persistence/entities/user-session.entity';
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryReservationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory-reservation.entity';
import { ProductOptionEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option.entity';
import { ProductOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option-value.entity';
import { ProductVariantOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant-option-value.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductReviewEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review.entity';
import { ProductReviewImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image.entity';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductViewHistoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-view-history.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ExchangeRateEntity } from '~/integrations/currency/infra/persistence/entities/exchange-rate.entity';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { OutboxEventEntity } from '~/domains/order/infra/persistence/entities/outbox-event.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { UserAddressEntity } from '~/domains/user/infra/persistence/entities/user-address.entity';
import { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { seedAuth } from './seeds/auth.seed';
import { seedCategories } from './seeds/category.seed';
import { seedChat } from './seeds/chat.seed';
import { seedCoupons } from './seeds/coupon.seed';
import { seedExchangeRates } from './seeds/exchange-rate.seed';
import { seedLocalOrderScenarios } from './seeds/local-order-scenario.seed';
import { seedBulkOrderDemo } from './seeds/order-bulk.seed';
import { seedOrderCartDemo } from './seeds/order-cart.seed';
import { seedLocalProductReviewOrders } from './seeds/product-review-local-order.seed';
import { seedProducts } from './seeds/product.seed';
import { seedProductReviews } from './seeds/product-review.seed';
import { seedProductViewHistory } from './seeds/product-view-history.seed';
import { seedShops } from './seeds/shop.seed';
import { seedUserProfiles } from './seeds/user-profile.seed';

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

async function runSeedStep<T>(label: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  console.log(`[seed] ${label}...`);

  const result = await work();

  console.log(`[seed] ${label} done in ${formatDuration(Date.now() - startedAt)}`);
  return result;
}

async function main() {
  const seedStartedAt = Date.now();
  console.log('[seed] Starting demo seed');

  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env, { debug: false }),
    entities: [
      UserEntity,
      UserCredentialEntity,
      UserSessionEntity,
      PasswordResetTokenEntity,
      EmailVerificationTokenEntity,
      UserPreferenceEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      CartEntity,
      CartItemEntity,
      ChatConversationEntity,
      ChatMessageEntity,
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
      CouponEntity,
      CouponUsageEntity,
      OrderEntity,
      OrderItemEntity,
      ShopEntity,
      ProductEntity,
      ProductImageEntity,
      ProductAttributeValueEntity,
      ProductVariantEntity,
      ProductOptionEntity,
      ProductOptionValueEntity,
      ProductVariantOptionValueEntity,
      ProductInventoryEntity,
      VariantPriceEntity,
      ProductInventoryReservationEntity,
      ProductReviewEntity,
      OutboxEventEntity,
      ProductReviewImageEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
      ProductViewHistoryEntity,
      ExchangeRateEntity,
      UserAddressEntity,
    ],
  });

  try {
    const em = orm.em.fork();

    await runSeedStep('Applying migrations', async () => orm.getMigrator().up());

    const { usersByEmail } = await runSeedStep('Seeding auth', async () => seedAuth(em));
    await runSeedStep('Seeding user profiles', async () =>
      seedUserProfiles(em, usersByEmail),
    );
    await runSeedStep('Seeding categories', async () => seedCategories(em));

    const { shopsBySlug } = await runSeedStep('Seeding shops', async () =>
      seedShops(em, usersByEmail),
    );
    await runSeedStep('Seeding exchange rates', async () => seedExchangeRates(em));
    await runSeedStep('Seeding products', async () => seedProducts(em, shopsBySlug));
    await runSeedStep('Seeding chat conversations', async () =>
      seedChat(em, usersByEmail),
    );
    await runSeedStep('Seeding product view history', async () =>
      seedProductViewHistory(em, usersByEmail),
    );
    await runSeedStep('Seeding coupons', async () => seedCoupons(em, shopsBySlug));
    await runSeedStep('Seeding demo orders and carts', async () =>
      seedOrderCartDemo(em, usersByEmail),
    );
    await runSeedStep('Seeding bulk bestseller orders', async () =>
      seedBulkOrderDemo(em),
    );
    await runSeedStep('Seeding local order scenarios', async () =>
      seedLocalOrderScenarios(em),
    );
    await runSeedStep('Seeding exact local review orders', async () =>
      seedLocalProductReviewOrders(em),
    );
    await runSeedStep('Seeding product reviews', async () =>
      seedProductReviews(em),
    );

    console.log('Seed completed');
    console.log(`[seed] Total duration: ${formatDuration(Date.now() - seedStartedAt)}`);
  }
  finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
