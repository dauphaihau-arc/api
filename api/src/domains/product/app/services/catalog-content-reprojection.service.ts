import { Injectable, Logger } from '@nestjs/common';
import { CatalogProductProjectorSourceRepository } from '../ports/catalog-product-projector-source.repository';
import { CatalogProductProjectorService } from './catalog-product-projector.service';

/**
 * Reprojects projected catalog documents after Localized Content changes.
 * Product translation writes call the product path; category translation
 * writes call the category path so every product in that category is rebuilt.
 */
@Injectable()
export class CatalogContentReprojectionService {
  private readonly logger = new Logger(CatalogContentReprojectionService.name);

  constructor(
    private readonly catalogProductProjectorSourceRepository: CatalogProductProjectorSourceRepository,
    private readonly catalogProductProjectorService: CatalogProductProjectorService,
  ) {}

  async reprojectProductTranslation(productId: string): Promise<void> {
    await this.catalogProductProjectorService.projectProduct(productId);
  }

  async reprojectCategoryTranslation(categoryId: string): Promise<void> {
    const productIds = await this.catalogProductProjectorSourceRepository
      .findIdsByCategoryId(categoryId);

    for (const productId of productIds) {
      await this.catalogProductProjectorService.projectProduct(productId);
    }

    this.logger.log(
      `Reprojected ${productIds.length} catalog documents for category ${categoryId}`,
    );
  }
}
