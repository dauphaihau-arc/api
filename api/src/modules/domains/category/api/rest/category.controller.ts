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
  ): Promise<{ categories: CategorySearchSuggestion[] }> {
    const categories = await this.searchCategoriesUseCase.execute(
      query.name,
      query.limit
    );

    return { categories };
  }

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  categories(
    @Query() query: ListCategoriesQueryDto
  ): Promise<CategorySummary[]> {
    return this.listCategoriesUseCase.execute(query.parentId);
  }

  @Get(':id/attributes')
  @Header('Cache-Control', 'private, no-cache')
  getCategoryAttributes(
    @Param('id') id: string
  ): Promise<{ attributes: CategoryAttributeSummary[] }> {
    return this.getCategoryAttributesUseCase.execute(id)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException)
      )
      .then((attributes) => ({ attributes }));
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  createCategory(@Body() body: CreateCategoryDto): Promise<CategorySummary> {
    return this.createCategoryUseCase.execute(body)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException)
      );
  }

  @Post(':id/attributes')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  createCategoryAttribute(
    @Param('id') id: string,
    @Body() body: CreateCategoryAttributeDto
  ): Promise<CategorySummary> {
    return this.createCategoryAttributeUseCase.execute({
      categoryId: id,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapCategoryAppErrorToHttpException)
    );
  }
}
