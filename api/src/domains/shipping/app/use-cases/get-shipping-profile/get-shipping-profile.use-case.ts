import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { ShippingProfileNotFoundError } from '../../errors/shipping-app.error';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView } from '../../shipping.types';

export type GetShippingProfileError = ShippingProfileNotFoundError;

@Injectable()
export class GetShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
  ): Promise<Result<ShippingProfileView, GetShippingProfileError>> {
    const profile = await this.shippingProfileRepository.findById(shopId, shippingProfileId);

    if (!profile) {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
      profile.id,
    ]);

    return ok(toShippingProfileView(profile, assignments));
  }
}
