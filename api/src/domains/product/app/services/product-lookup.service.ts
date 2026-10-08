import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductLookupRepository } from '../ports/product-lookup.repository';

@Injectable()
export class ProductLookupService {
  constructor(private readonly repository: ProductLookupRepository) {}

  async resolveProductPublicId(publicId: string): Promise<string> {
    const id = await this.repository.findInternalIdByPublicId(publicId);
    if (!id) throw new NotFoundException('Product was not found');
    return id;
  }

  resolveProductPublicIds(publicIds: readonly string[]): Promise<readonly (string | null)[]> {
    return this.repository.findInternalIdsByPublicIds(publicIds);
  }
}
