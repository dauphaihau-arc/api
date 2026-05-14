import {
  Controller, Get, Header, NotFoundException, Param, Query 
} from '@nestjs/common';
import type {
  PublicProductDetail,
  PublicProductListResult
} from '../../app/product.types';
import { GetPublicProductByIdUseCase } from '../../app/use-cases/get-public-product-by-id/get-public-product-by-id.use-case';
import { ListPublicProductsUseCase } from '../../app/use-cases/list-public-products/list-public-products.use-case';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';

@Controller('products')
export class ProductController {
  constructor(
    private readonly listPublicProductsUseCase: ListPublicProductsUseCase,
    private readonly getPublicProductByIdUseCase: GetPublicProductByIdUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  listProducts(
    @Query() query: ListPublicProductsQueryDto
  ): Promise<PublicProductListResult> {
    return this.listPublicProductsUseCase.execute(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=60')
  async product(@Param('id') id: string): Promise<PublicProductDetail> {
    const product = await this.getPublicProductByIdUseCase.execute(id);

    if (!product) {
      throw new NotFoundException('Product was not found');
    }

    return product;
  }
}
