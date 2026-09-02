import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { CatalogProductProjectorService } from '~/domains/product/app/services/catalog-product-projector.service';

type ProjectShopCatalogProductsPayload =
  AppJobPayloadMap['catalog.project-shop-products'];

@Injectable()
export class ProjectShopCatalogProductsJob {
  private readonly logger = new Logger(ProjectShopCatalogProductsJob.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly catalogProductProjectorService: CatalogProductProjectorService,
  ) {}

  async run(payload: ProjectShopCatalogProductsPayload): Promise<void> {
    const products = await this.entityManager.fork().getRepository(ProductEntity).find(
      {
        shop: payload.shopId,
        state: ProductState.ACTIVE,
        ...(payload.productIds?.length ? { id: { $in: payload.productIds } } : {}),
      },
      { fields: ['id'] },
    );

    for (const product of products) {
      await this.catalogProductProjectorService.projectProduct(product.id);
    }

    this.logger.log(
      `Projected ${products.length} catalog products for shop ${payload.shopId}`,
    );
  }
}
