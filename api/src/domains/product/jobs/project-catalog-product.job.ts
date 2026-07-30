import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';
import { CatalogProductProjectorService } from '~/domains/product/app/services/catalog-product-projector.service';

type ProjectCatalogProductPayload =
  AppJobPayloadMap['catalog.project-product'];

@Injectable()
export class ProjectCatalogProductJob {
  private readonly logger = new Logger(ProjectCatalogProductJob.name);

  constructor(
    private readonly catalogProductProjectorService: CatalogProductProjectorService,
  ) {}

  async run(payload: ProjectCatalogProductPayload): Promise<void> {
    await this.catalogProductProjectorService.projectProduct(payload.productId);

    this.logger.log(
      `Processed catalog projection job for product ${payload.productId}`,
    );
  }
}
