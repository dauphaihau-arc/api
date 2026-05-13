import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '../src/config/database.config';
import { CategoryAttributeOptionEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { CurrentUserCredentialEntity } from '../src/modules/domains/auth/infra/persistence/entities/current-user-credential.entity';
import { CurrentUserEntity } from '../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { EmailVerificationTokenEntity } from '../src/modules/domains/auth/infra/persistence/entities/email-verification-token.entity';
import { PasswordResetTokenEntity } from '../src/modules/domains/auth/infra/persistence/entities/password-reset-token.entity';
import { PermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '../src/modules/domains/auth/infra/persistence/entities/role.entity';
import { UserRoleEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-role.entity';
import { UserSessionEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-session.entity';
import { ProductAttributeValueEntity } from '../src/modules/domains/product/infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from '../src/modules/domains/product/infra/persistence/entities/product-image.entity';
import { ProductInventoryReservationEntity } from '../src/modules/domains/product/infra/persistence/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from '../src/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '../src/modules/domains/product/infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '../src/modules/domains/product/infra/persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '../src/modules/domains/product/infra/persistence/entities/product-variant.entity';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { seedAuth } from './seeds/auth.seed';
import { seedCategories } from './seeds/category.seed';
import { seedProducts } from './seeds/product.seed';
import { seedShops } from './seeds/shop.seed';

async function main() {
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [
      CurrentUserEntity,
      CurrentUserCredentialEntity,
      UserSessionEntity,
      PasswordResetTokenEntity,
      EmailVerificationTokenEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
      ShopEntity,
      ProductEntity,
      ProductImageEntity,
      ProductAttributeValueEntity,
      ProductVariantEntity,
      ProductInventoryEntity,
      ProductInventoryReservationEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
    ],
  });

  try {
    const em = orm.em.fork();

    await orm.getMigrator().up();

    const { usersByEmail } = await seedAuth(em);
    await seedCategories(em);
    const shopsByName = await seedShops(em, usersByEmail);
    await seedProducts(em, shopsByName);

    console.log('Seed completed');
    console.log('Users:');
    console.log('- admin@example.com / password123 (admin)');
    console.log('- member@example.com / password123 (member)');
    console.log('- maker.olive@example.com / password123 (member)');
    console.log('- maker.mason@example.com / password123 (member)');
    console.log('- maker.sage@example.com / password123 (member)');
  } finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
