import { Injectable, Logger } from '@nestjs/common';
import { ProductImageService } from '~/modules/domains/product/app/services/product-image.service';
import { CatalogProductProjectorService } from '~/modules/domains/product/app/services/catalog-product-projector.service';
import type { AppJobPayloadMap } from './job.types';

type GenerateProductImageVariantsPayload =
  AppJobPayloadMap['product.generate-image-variants'];

@Injectable()
export class GenerateProductImageVariantsJob {
  private readonly logger = new Logger(GenerateProductImageVariantsJob.name);

  constructor(
    private readonly productImageService: ProductImageService,
    private readonly catalogProductProjectorService: CatalogProductProjectorService,
  ) {}

  async run(payload: GenerateProductImageVariantsPayload): Promise<void> {
    await this.productImageService.generateVariants(payload.productId);
    await this.catalogProductProjectorService.projectProduct(payload.productId);

    this.logger.log(
      `Processed product image variants job for product ${payload.productId}`,
    );
  }
}
