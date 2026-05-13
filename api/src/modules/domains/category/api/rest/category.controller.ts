import {
  Body, Controller, Get, Header, Param, Post, Query, UseGuards 
} from '@nestjs/common';
import { resolveOrThrow } from '~/common/application/result';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateCategoryAttributeUseCase } from '../../app/use-cases/create-category-attribute.use-case';
import { CreateCategoryUseCase } from '../../app/use-cases/create-category.use-case';
import { ListCategoriesUseCase } from '../../app/use-cases/list-categories.use-case';
import type { CategorySummary } from '../../app/category.types';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { mapCategoryAppErrorToHttpException } from './category-http-error-mapper';

@Controller('categories')
export class CategoryController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly createCategoryAttributeUseCase: CreateCategoryAttributeUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  categories(
    @Query() query: ListCategoriesQueryDto
  ): Promise<CategorySummary[]> {
    return this.listCategoriesUseCase.execute(query.parentId);
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
