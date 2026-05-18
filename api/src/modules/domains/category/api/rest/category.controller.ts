import {
  Body, Controller, Get, Header, Param, Post, Query, UseGuards 
} from '@nestjs/common';
import { resolveOrThrow } from '~/common/application/result';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateCategoryAttributeUseCase } from '../../app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { CreateCategoryUseCase } from '../../app/use-cases/create-category/create-category.use-case';
import { GetCategoryAttributesUseCase } from '../../app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { ListCategoriesUseCase } from '../../app/use-cases/list-categories/list-categories.use-case';
import { SearchCategoriesUseCase } from '../../app/use-cases/search-categories/search-categories.use-case';
import type {
  CategoryAttributeSummary,
  CategorySearchSuggestion,
  CategorySummary
} from '../../app/category.types';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { SearchCategoriesQueryDto } from './dto/search-categories.query.dto';
import { mapCategoryAppErrorToHttpException } from './category-http-error-mapper';

type CategoryAttributeOptionResponse = {
  id: string;
  value: string;
  rank: number;
};

type CategoryAttributeResponse = {
  id: string;
  name: string;
  input_type: string;
  is_required: boolean;
  rank: number;
  options: CategoryAttributeOptionResponse[];
};

type CategoryResponse = {
  id: string;
  parent_id?: string;
  name: string;
  rank: number;
  image_storage_key?: string;
  image_url?: string;
  attributes: CategoryAttributeResponse[];
};

type CategorySearchSuggestionResponse = {
  id: string;
  last_name_category: string;
  categories_related: string[];
};

const toCategoryAttributeOptionResponse = (
  option: CategoryAttributeSummary['options'][number]
): CategoryAttributeOptionResponse => ({
  id: option.id,
  value: option.value,
  rank: option.rank,
});

const toCategoryAttributeResponse = (
  attribute: CategoryAttributeSummary
): CategoryAttributeResponse => ({
  id: attribute.id,
  name: attribute.name,
  input_type: attribute.inputType,
  is_required: attribute.isRequired,
  rank: attribute.rank,
  options: attribute.options.map(toCategoryAttributeOptionResponse),
});

const toCategoryResponse = (
  category: CategorySummary
): CategoryResponse => ({
  id: category.id,
  parent_id: category.parentId,
  name: category.name,
  rank: category.rank,
  image_storage_key: category.imageStorageKey,
  image_url: category.imageUrl,
  attributes: category.attributes.map(toCategoryAttributeResponse),
});

const toCategorySearchSuggestionResponse = (
  category: CategorySearchSuggestion
): CategorySearchSuggestionResponse => ({
  id: category.id,
  last_name_category: category.lastNameCategory,
  categories_related: category.categoriesRelated,
});

@Controller('categories')
export class CategoryController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly createCategoryAttributeUseCase: CreateCategoryAttributeUseCase,
    private readonly getCategoryAttributesUseCase: GetCategoryAttributesUseCase,
    private readonly searchCategoriesUseCase: SearchCategoriesUseCase
  ) {}

  @Get('search')
  @Header('Cache-Control', 'private, no-cache')
  async searchCategories(
    @Query() query: SearchCategoriesQueryDto
  ): Promise<{ categories: CategorySearchSuggestionResponse[] }> {
    const categories = await this.searchCategoriesUseCase.execute(
      query.name,
      query.limit
    );

    return { categories: categories.map(toCategorySearchSuggestionResponse) };
  }

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  categories(
    @Query() query: ListCategoriesQueryDto
  ): Promise<CategoryResponse[]> {
    return this.listCategoriesUseCase.execute(query.parentId)
      .then((categories) => categories.map(toCategoryResponse));
  }

  @Get(':id/attributes')
  @Header('Cache-Control', 'private, no-cache')
  getCategoryAttributes(
    @Param('id') id: string
  ): Promise<{ attributes: CategoryAttributeResponse[] }> {
    return this.getCategoryAttributesUseCase.execute(id)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException)
      )
      .then((attributes) => ({
        attributes: attributes.map(toCategoryAttributeResponse),
      }));
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  createCategory(@Body() body: CreateCategoryDto): Promise<CategoryResponse> {
    return this.createCategoryUseCase.execute(body)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException)
      )
      .then(toCategoryResponse);
  }

  @Post(':id/attributes')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  createCategoryAttribute(
    @Param('id') id: string,
    @Body() body: CreateCategoryAttributeDto
  ): Promise<CategoryResponse> {
    return this.createCategoryAttributeUseCase.execute({
      categoryId: id,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapCategoryAppErrorToHttpException)
    ).then(toCategoryResponse);
  }
}
