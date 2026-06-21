import { Inject, Injectable, Logger } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductState } from '../../domain/enums/product-state.enum';
import { CatalogProductProjectorSourceRepository } from '../ports/catalog-product-projector-source.repository';
import { CatalogProductDocumentRepository } from '../ports/catalog-product-document.repository';
import { CatalogSearchDocumentRepository } from '../ports/catalog-search-document.repository';
import { CatalogProductSlugRepository } from '../ports/catalog-product-slug.repository';
import { toCatalogProductDocument } from '../../infra/catalog/mongo/documents/catalog-product-document.mapper';
import { toCatalogSearchDocument } from '../../infra/catalog/mongo/documents/catalog-search-document.mapper';
import { toCatalogProductSlugDocument } from '../../infra/catalog/mongo/documents/catalog-product-slug.mapper';

@Injectable()
export class CatalogProductProjectorService {
  private readonly logger = new Logger(CatalogProductProjectorService.name);

  constructor(
    private readonly catalogProductProjectorSourceRepository: CatalogProductProjectorSourceRepository,
    private readonly storageService: StorageService,
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogProductDocumentRepository: CatalogProductDocumentRepository,
    private readonly catalogProductSlugRepository: CatalogProductSlugRepository,
    private readonly catalogSearchDocumentRepository: CatalogSearchDocumentRepository,
  ) {}

  async projectProduct(productId: string): Promise<void> {
    if (this.catalogConfig.driver !== 'mongodb') {
      return;
    }

    const product = await this.catalogProductProjectorSourceRepository.findById(productId);

    if (!product || product.state !== ProductState.ACTIVE) {
      await this.removeProduct(productId);
      return;
    }

    const document = toCatalogProductDocument(
      product,
      (storageKey) => this.storageService.getPublicUrl(storageKey),
    );
    const searchDocument = toCatalogSearchDocument(
      product,
      (storageKey) => this.storageService.getPublicUrl(storageKey),
    );
    const slugDocument = toCatalogProductSlugDocument(product);

    await Promise.all([
      this.catalogProductDocumentRepository.upsert(document),
      this.catalogProductSlugRepository.upsert(slugDocument),
      this.catalogSearchDocumentRepository.upsert(searchDocument),
    ]);

    this.logger.log(`Projected catalog document for product ${productId}`);
  }

  async removeProduct(productId: string): Promise<void> {
    if (this.catalogConfig.driver !== 'mongodb') {
      return;
    }

    await Promise.all([
      this.catalogProductDocumentRepository.deleteByProductId(productId),
      this.catalogProductSlugRepository.deleteByProductId(productId),
      this.catalogSearchDocumentRepository.deleteByProductId(productId),
    ]);
  }
}
