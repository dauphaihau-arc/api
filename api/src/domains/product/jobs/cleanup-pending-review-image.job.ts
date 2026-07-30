import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';
import { PendingReviewImageUploadService } from '~/domains/product/app/pending-review-image-upload.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';

type CleanupPendingReviewImagePayload =
  AppJobPayloadMap['product.cleanup-pending-review-image'];

@Injectable()
export class CleanupPendingReviewImageJob {
  private readonly logger = new Logger(CleanupPendingReviewImageJob.name);

  constructor(
    private readonly pendingReviewImageUploadService: PendingReviewImageUploadService,
    private readonly storageService: StorageService,
  ) {}

  async run(payload: CleanupPendingReviewImagePayload): Promise<void> {
    const pending = await this.pendingReviewImageUploadService.getPending(payload.storageKey);

    if (!pending) {
      return;
    }

    await this.storageService.deleteObject(payload.storageKey);
    await this.pendingReviewImageUploadService.clearPending(payload.storageKey);

    this.logger.log(
      `Cleaned pending review image ${payload.storageKey}`,
    );
  }
}
