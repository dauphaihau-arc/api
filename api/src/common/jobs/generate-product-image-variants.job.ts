import { Injectable, Logger } from '@nestjs/common';
import { ProductImageService } from '~/modules/domains/product/app/services/product-image.service';
import type { AppJobPayloadMap } from './job.types';

type GenerateProductImageVariantsPayload =
  AppJobPayloadMap['product.generate-image-variants'];

@Injectable()
export class GenerateProductImageVariantsJob {
  private readonly logger = new Logger(GenerateProductImageVariantsJob.name);

  constructor(private readonly productImageService: ProductImageService) {}

  async run(payload: GenerateProductImageVariantsPayload): Promise<void> {
    await this.productImageService.generateVariants(payload.productId);

    this.logger.log(
      `Processed product image variants job for product ${payload.productId}`
    );
  }
}
