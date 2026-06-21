import {
  Body, Controller, Get, Header, Param, Post, Query, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { resolveOrThrow } from '~/common/application/result';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateCategoryAttributeUseCase } from '../../app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { CreateCategoryUseCase } from '../../app/use-cases/create-category/create-category.use-case';
import { GetCategoryAttributesUseCase } from '../../app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { ListCategoriesUseCase } from '../../app/use-cases/list-categories/list-categories.use-case';
import { SuggestCategoriesUseCase } from '../../app/use-cases/suggest-categories/suggest-categories.use-case';
import {
  toCategoryAttributeResponse,
  toCategoryResponse,
  toCategorySuggestionResponse,
} from './category-response.mapper';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';
import type {
  CategoryAttributeResponse,
  CategoryResponse,
  CategorySuggestionResponse,
} from './dto/category.response';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { SuggestCategoriesQueryDto } from './dto/suggest-categories.query.dto';
import { mapCategoryAppErrorToHttpException } from './category-http-error-mapper';

@Controller('categories')
@ApiTags('Categories')
export class CategoryController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly createCategoryAttributeUseCase: CreateCategoryAttributeUseCase,
    private readonly getCategoryAttributesUseCase: GetCategoryAttributesUseCase,
    private readonly suggestCategoriesUseCase: SuggestCategoriesUseCase,
  ) {}

  @Get('suggestions')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Suggest categories by name' })
  @ApiOkResponse({
    description: 'Matching category suggestions.',
    schema: { type: 'object' },
  })
  async suggestCategories(
    @Query() query: SuggestCategoriesQueryDto,
  ): Promise<{ categories: CategorySuggestionResponse[] }> {
    const categories = await this.suggestCategoriesUseCase.execute(
      query.name,
      query.limit,
    );
    return { categories: categories.map(toCategorySuggestionResponse) };
  }

  @Get()
  @SkipThrottle()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List categories' })
  @ApiOkResponse({
    description: 'Category list.',
    schema: { type: 'array', items: { type: 'object' } },
  })
  categories(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponse[]> {
    return this.listCategoriesUseCase.execute(query.parentId)
      .then((categories) => categories.map(toCategoryResponse));
  }

  @Get(':id/attributes')
  @SkipThrottle()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get category attributes' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Category attributes.',
    schema: { type: 'object' },
  })
  getCategoryAttributes(
    @Param('id') id: string,
  ): Promise<{ attributes: CategoryAttributeResponse[] }> {
    return this.getCategoryAttributesUseCase.execute(id)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException),
      )
      .then((attributes) => ({
        attributes: attributes.map(toCategoryAttributeResponse),
      }));
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiCookieAuth('accessCookie')
  @ApiOperation({ summary: 'Create a category' })
  @ApiOkResponse({
    description: 'Created category.',
    schema: { type: 'object' },
  })
  createCategory(@Body() body: CreateCategoryDto): Promise<CategoryResponse> {
    return this.createCategoryUseCase.execute(body)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException),
      )
      .then(toCategoryResponse);
  }

  @Post(':id/attributes')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiCookieAuth('accessCookie')
  @ApiOperation({ summary: 'Create a category attribute' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Updated category.',
    schema: { type: 'object' },
  })
  createCategoryAttribute(
    @Param('id') id: string,
    @Body() body: CreateCategoryAttributeDto,
  ): Promise<CategoryResponse> {
    return this.createCategoryAttributeUseCase.execute({
      categoryId: id,
      ...body,
    }).then((result) =>
      resolveOrThrow(result, mapCategoryAppErrorToHttpException),
    ).then(toCategoryResponse);
  }
}
