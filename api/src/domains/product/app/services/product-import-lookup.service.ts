import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductImportQueryRepository } from '../ports/product-import-query.repository';

@Injectable()
export class ProductImportLookupService {
  constructor(private readonly productImportQueryRepository: ProductImportQueryRepository) {}

  async resolvePublicId(publicId: string): Promise<string> {
    const id = await this.productImportQueryRepository.findByPublicId(publicId);
    if (!id) throw new NotFoundException('Product import was not found');
    return id;
  }
}
