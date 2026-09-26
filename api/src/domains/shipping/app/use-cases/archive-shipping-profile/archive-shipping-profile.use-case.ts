import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  ShippingProfileInUseError,
  ShippingProfileNotFoundError,
  ShippingProfileVersionConflictError,
} from '../../errors/shipping-app.error';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView } from '../../shipping.types';

export type ArchiveShippingProfileError =
  | ShippingProfileNotFoundError
  | ShippingProfileVersionConflictError
  | ShippingProfileInUseError;

@Injectable()
export class ArchiveShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
  ): Promise<Result<ShippingProfileView, ArchiveShippingProfileError>> {
    const existing = await this.shippingProfileRepository.findById(shopId, shippingProfileId);

    if (!existing) {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    if (existing.status === ShippingProfileStatus.ARCHIVED) {
      const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
        shippingProfileId,
      ]);
      return ok(toShippingProfileView(existing, assignments));
    }

    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
      shippingProfileId,
    ]);

    // The published-reference check runs inside the repository transaction,
    // under the same profile row lock that assignment takes. So nobody can
    // attach this profile to a published Product in the moment between that
    // check and the archive write.
    const outcome = await this.shippingProfileRepository.archive({
      shopId,
      shippingProfileId,
      expectedVersion: existing.version,
    });

    if (outcome.status === 'published_products_reference') {
      return err(new ShippingProfileInUseError(outcome.publishedProductCount));
    }

    if (outcome.status === 'version_conflict') {
      const current = await this.shippingProfileRepository.findById(shopId, shippingProfileId);

      if (!current) {
        return err(new ShippingProfileNotFoundError(shippingProfileId));
      }

      return err(new ShippingProfileVersionConflictError(current));
    }

    return ok(toShippingProfileView(outcome.profile, assignments));
  }
}
