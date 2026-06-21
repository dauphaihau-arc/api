import { Injectable, Logger } from '@nestjs/common';
import { ReviewImageService } from '~/modules/domains/product/app/services/review-image.service';
import type { AppJobPayloadMap } from './job.types';

type GenerateReviewImageVariantsPayload =
  AppJobPayloadMap['product-review.generate-image-variants'];

@Injectable()
export class GenerateReviewImageVariantsJob {
  private readonly logger = new Logger(GenerateReviewImageVariantsJob.name);

  constructor(
    private readonly reviewImageService: ReviewImageService,
  ) {}

  async run(payload: GenerateReviewImageVariantsPayload): Promise<void> {
    await this.reviewImageService.generateVariants(payload.reviewImageId);

    this.logger.log(
      `Processed review image variants job for review image ${payload.reviewImageId}`,
    );
  }
}
