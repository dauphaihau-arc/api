import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../ports/product.repository';
import type { PublicProductDetail } from '../product.types';

@Injectable()
export class GetPublicProductByIdUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(id: string): Promise<PublicProductDetail | null> {
    return this.productRepository.findPublicById(id);
  }
}
