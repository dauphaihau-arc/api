import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { CategoryAttributeOptionEntity } from '~/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { LocationAdministrativeAreaEntity } from '~/domains/location/infra/persistence/entities/location-administrative-area.entity';
import { LocationCountryEntity } from '~/domains/location/infra/persistence/entities/location-country.entity';
import { LocationDatasetVersionEntity } from '~/domains/location/infra/persistence/entities/location-dataset-version.entity';
import { seedAuthReferenceData } from './seeds/auth.seed';
import { seedCategories } from './seeds/category.seed';
import { seedLocations } from './seeds/location.seed';

async function main() {
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env, { debug: false }),
    entities: [
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
      LocationCountryEntity,
      LocationAdministrativeAreaEntity,
      LocationDatasetVersionEntity,
    ],
  });

  try {
    const em = orm.em.fork();

    await orm.getMigrator().up();
    await seedAuthReferenceData(em);
    await seedCategories(em);
    await seedLocations(em);

    console.log('Production seed completed');
    console.log(
      'Seeded reference data only: roles, permissions, categories, locations',
    );
  }
  finally {
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
