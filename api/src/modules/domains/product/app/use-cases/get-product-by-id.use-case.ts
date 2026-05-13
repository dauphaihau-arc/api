import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../ports/product.repository';
import type { ProductDraftSummary } from '../product.types';

@Injectable()
export class GetProductByIdUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(id: string): Promise<ProductDraftSummary | null> {
    return this.productRepository.findById(id);
  }
}
