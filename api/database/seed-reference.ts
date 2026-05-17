import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '../src/config/database.config';
import { CategoryAttributeOptionEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '../src/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '../src/modules/domains/category/infra/persistence/entities/category.entity';
import { PermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '../src/modules/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '../src/modules/domains/auth/infra/persistence/entities/role.entity';
import { seedAuthReferenceData } from './seeds/auth.seed';
import { seedCategories } from './seeds/category.seed';

async function main() {
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env),
    entities: [
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
    ],
  });

  try {
    const em = orm.em.fork();

    await orm.getMigrator().up();
    await seedAuthReferenceData(em);
    await seedCategories(em);

    console.log('Production seed completed');
    console.log('Seeded reference data only: roles, permissions, categories');
  } finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
