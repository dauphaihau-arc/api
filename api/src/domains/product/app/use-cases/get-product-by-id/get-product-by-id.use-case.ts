import { Injectable } from '@nestjs/common';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

@Injectable()
export class GetProductByIdUseCase {
  constructor(private readonly productRepository: SellerProductQueryRepository) {}

  async execute(id: string): Promise<ProductDraftSummary | null> {
    return this.productRepository.findById(id);
  }
}
