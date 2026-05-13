import {
  Controller, Get, Header, Query 
} from '@nestjs/common';
import type { PublicProductListResult } from '../../app/product.types';
import { ListPublicProductsUseCase } from '../../app/use-cases/list-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';

@Controller('products')
export class ProductController {
  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  listProducts(
    @Query() query: ListPublicProductsQueryDto
  ): Promise<PublicProductListResult> {
    return this.listPublicProductsUseCase.execute(query);
  }
}
