import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '../src/config/database.config';
import { CategoryAttributeOptionEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { CouponUsageEntity } from '../src/modules/domains/coupon/infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '../src/modules/domains/coupon/infra/persistence/entities/coupon.entity';
import { CurrentUserCredentialEntity } from '../src/modules/domains/auth/infra/persistence/entities/current-user-credential.entity';
import { CurrentUserEntity } from '../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { CartEntity } from '../src/modules/domains/cart/infra/persistence/entities/cart.entity';
import { CartItemEntity } from '../src/modules/domains/cart/infra/persistence/entities/cart-item.entity';
import { ChatConversationEntity } from '../src/modules/domains/chat/infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '../src/modules/domains/chat/infra/persistence/entities/chat-message.entity';
import { EmailVerificationTokenEntity } from '../src/modules/domains/auth/infra/persistence/entities/email-verification-token.entity';
import { PasswordResetTokenEntity } from '../src/modules/domains/auth/infra/persistence/entities/password-reset-token.entity';
import { PermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '../src/modules/domains/auth/infra/persistence/entities/role.entity';
import { UserRoleEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-role.entity';
import { UserPreferenceEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-preference.entity';
import { UserSessionEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-session.entity';
import { ProductAttributeValueEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryReservationEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductViewHistoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-view-history.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ExchangeRateEntity } from '../src/modules/shared/currency/infra/persistence/entities/exchange-rate.entity';
import { OrderEntity } from '../src/modules/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../src/modules/domains/order/infra/persistence/entities/order-item.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { UserAddressEntity } from '../src/modules/domains/user/infra/persistence/entities/user-address.entity';
import { seedAuth } from './seeds/auth.seed';
import { seedCategories } from './seeds/category.seed';
import { seedChat } from './seeds/chat.seed';
import { seedCoupons } from './seeds/coupon.seed';
import { seedExchangeRates } from './seeds/exchange-rate.seed';
import { seedBulkOrderDemo } from './seeds/order-bulk.seed';
import { seedOrderCartDemo } from './seeds/order-cart.seed';
import { seedProducts } from './seeds/product.seed';
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
    ...buildDatabaseConfig(process.env),
    entities: [
      CurrentUserEntity,
      CurrentUserCredentialEntity,
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
      ProductInventoryEntity,
      ProductInventoryReservationEntity,
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
      seedUserProfiles(em, usersByEmail)
    );
    await runSeedStep('Seeding categories', async () => seedCategories(em));

    const { shopsBySlug } = await runSeedStep('Seeding shops', async () =>
      seedShops(em, usersByEmail)
    );
    await runSeedStep('Seeding exchange rates', async () => seedExchangeRates(em));
    await runSeedStep('Seeding products', async () => seedProducts(em, shopsBySlug));
    await runSeedStep('Seeding chat conversations', async () =>
      seedChat(em, usersByEmail)
    );
    await runSeedStep('Seeding product view history', async () =>
      seedProductViewHistory(em, usersByEmail)
    );
    await runSeedStep('Seeding coupons', async () => seedCoupons(em, shopsBySlug));
    await runSeedStep('Seeding demo orders and carts', async () =>
      seedOrderCartDemo(em, usersByEmail)
    );
    await runSeedStep('Seeding bulk bestseller orders', async () =>
      seedBulkOrderDemo(em)
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
