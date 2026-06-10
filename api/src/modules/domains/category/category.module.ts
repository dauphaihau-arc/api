import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryCommandRepository } from './app/ports/category-command.repository';
import { CategoryQueryRepository } from './app/ports/category-query.repository';
import { CategoryRepository } from './app/ports/category.repository';
import { CreateCategoryAttributeUseCase } from './app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { CreateCategoryUseCase } from './app/use-cases/create-category/create-category.use-case';
import { GetCategoryAttributesUseCase } from './app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { ListCategoriesUseCase } from './app/use-cases/list-categories/list-categories.use-case';
import { SuggestCategoriesUseCase } from './app/use-cases/suggest-categories/suggest-categories.use-case';
import { CategoryController } from './api/rest/category.controller';
import { DelegatingCategoryRepository } from './infra/category.repository';
import { MikroOrmCategoryCommandRepository } from './infra/mikro-orm-category-command.repository';
import { MikroOrmCategoryQueryRepository } from './infra/mikro-orm-category-query.repository';
import { CategoryAttributeOptionEntity } from './infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from './infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from './infra/persistence/entities/category.entity';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    StorageModule,
    MikroOrmModule.forFeature([
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
    ]),
  ],
  controllers: [CategoryController],
  providers: [
    {
      provide: CategoryCommandRepository,
      useExisting: MikroOrmCategoryCommandRepository,
    },
    {
      provide: CategoryQueryRepository,
      useExisting: MikroOrmCategoryQueryRepository,
    },
    {
      provide: CategoryRepository,
      useExisting: DelegatingCategoryRepository,
    },
    DelegatingCategoryRepository,
    MikroOrmCategoryCommandRepository,
    MikroOrmCategoryQueryRepository,
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    CreateCategoryAttributeUseCase,
    GetCategoryAttributesUseCase,
    SuggestCategoriesUseCase,
  ],
  exports: [
    CategoryRepository,
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    CreateCategoryAttributeUseCase,
    GetCategoryAttributesUseCase,
    SuggestCategoriesUseCase,
  ],
})
export class CategoryModule {}
