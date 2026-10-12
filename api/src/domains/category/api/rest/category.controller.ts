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
import { resolveOrThrow } from '~/platform/application/result';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { CreateCategoryAttributeUseCase } from '../../app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { CreateCategoryUseCase } from '../../app/use-cases/create-category/create-category.use-case';
import { GetCategoryAttributesUseCase } from '../../app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { ListCategoriesUseCase } from '../../app/use-cases/list-categories/list-categories.use-case';
import { ResolveCategoryUseCase } from '../../app/use-cases/resolve-category/resolve-category.use-case';
import { SuggestCategoriesUseCase } from '../../app/use-cases/suggest-categories/suggest-categories.use-case';
import {
  toCategoryAttributeResponse,
  toCategoryResolutionResponse,
  toCategoryResponse,
  toCategorySuggestionResponse,
} from './presenters/category-response.mapper';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';
import type {
  CategoryAttributeResponse,
  CategoryResolutionResponse,
  CategoryResponse,
  CategorySuggestionResponse,
} from './responses/category.response';
import {
  CategoryAttributeListResponseDto,
  CategoryResolutionResponseDto,
  CategoryResponseDto,
  CategorySuggestionListResponseDto,
} from './responses/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { SuggestCategoriesQueryDto } from './dto/suggest-categories.query.dto';
import { mapCategoryAppErrorToHttpException } from './errors/category-http-error-mapper';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { categoryErrorResponses } from './errors/category-error-responses';
import { CATEGORY_IDENTITY_CONTRACT_VERSION } from '../../app/category-identity-contract';
import { CategoryIdentityContractResponseDto } from './responses/category-response.dto';

@Controller('categories')
@ApiErrorResponses(categoryErrorResponses.common)
@ApiTags('Categories')
export class CategoryController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly resolveCategoryUseCase: ResolveCategoryUseCase,
    private readonly createCategoryAttributeUseCase: CreateCategoryAttributeUseCase,
    private readonly getCategoryAttributesUseCase: GetCategoryAttributesUseCase,
    private readonly suggestCategoriesUseCase: SuggestCategoriesUseCase,
  ) {}

  @Get('contract')
  @SkipThrottle()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the category identity contract version' })
  @ApiOkResponse({
    description: 'Category identity contract version.',
    type: CategoryIdentityContractResponseDto,
  })
  categoryIdentityContract(): { version: string } {
    return { version: CATEGORY_IDENTITY_CONTRACT_VERSION };
  }

  @Get('suggestions')
  @Header('Cache-Control', 'private, no-cache')
  @ApiErrorResponses(categoryErrorResponses.suggestions)
  @ApiOperation({ summary: 'Suggest categories by name' })
  @ApiOkResponse({
    description: 'Matching category suggestions.',
    type: CategorySuggestionListResponseDto,
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
  @ApiErrorResponses(categoryErrorResponses.list)
  @ApiOperation({ summary: 'List categories' })
  @ApiOkResponse({
    description: 'Category list.',
    type: CategoryResponseDto,
    isArray: true,
  })
  categories(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponse[]> {
    return this.listCategoriesUseCase.execute(query.parentId)
      .then((categories) => categories.map(toCategoryResponse));
  }

  @Get(':id')
  @SkipThrottle()
  @Header('Cache-Control', 'private, no-cache')
  @ApiErrorResponses(categoryErrorResponses.resolve)
  @ApiOperation({ summary: 'Resolve a category by public identity' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Resolved category with ordered root-to-current ancestry.',
    type: CategoryResolutionResponseDto,
  })
  getCategory(@Param('id') id: string): Promise<CategoryResolutionResponse> {
    return this.resolveCategoryUseCase.execute(id)
      .then((result) =>
        resolveOrThrow(result, mapCategoryAppErrorToHttpException),
      )
      .then(toCategoryResolutionResponse);
  }

  @Get(':id/attributes')
  @SkipThrottle()
  @Header('Cache-Control', 'private, no-cache')
  @ApiErrorResponses(categoryErrorResponses.attributes)
  @ApiOperation({ summary: 'Get category attributes' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Category attributes.',
    type: CategoryAttributeListResponseDto,
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
  @ApiErrorResponses(categoryErrorResponses.create)
  @ApiOperation({ summary: 'Create a category' })
  @ApiOkResponse({
    description: 'Created category.',
    type: CategoryResponseDto,
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
  @ApiErrorResponses(categoryErrorResponses.createAttribute)
  @ApiOperation({ summary: 'Create a category attribute' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Updated category.',
    type: CategoryResponseDto,
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
