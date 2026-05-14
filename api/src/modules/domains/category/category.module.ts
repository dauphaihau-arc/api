import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CategoryRepository } from './app/ports/category.repository';
import { CreateCategoryAttributeUseCase } from './app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { CreateCategoryUseCase } from './app/use-cases/create-category/create-category.use-case';
import { GetCategoryAttributesUseCase } from './app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { ListCategoriesUseCase } from './app/use-cases/list-categories/list-categories.use-case';
import { SearchCategoriesUseCase } from './app/use-cases/search-categories/search-categories.use-case';
import { CategoryController } from './api/rest/category.controller';
import { MikroOrmCategoryRepository } from './infra/mikro-orm-category.repository';
import { CategoryAttributeOptionEntity } from './infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from './infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from './infra/persistence/entities/category.entity';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forFeature([
      CategoryEntity,
      CategoryAttributeEntity,
      CategoryAttributeOptionEntity,
    ]),
  ],
  controllers: [CategoryController],
  providers: [
    {
      provide: CategoryRepository,
      useClass: MikroOrmCategoryRepository,
    },
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    CreateCategoryAttributeUseCase,
    GetCategoryAttributesUseCase,
    SearchCategoriesUseCase,
  ],
  exports: [
    CategoryRepository,
    CreateCategoryUseCase,
    ListCategoriesUseCase,
    CreateCategoryAttributeUseCase,
    GetCategoryAttributesUseCase,
    SearchCategoriesUseCase,
  ],
})
export class CategoryModule {}
