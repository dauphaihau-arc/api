import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductShippingInput {
  originCountry: string;
  originZip: string;
  processTimeLabel: string;
  destinations: Array<{
    countryCode: string;
    deliveryTimeLabel: string;
    service: string;
    chargeType: ProductShippingCharge;
  }>;
}

type SetProductShippingError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class SetProductShippingUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductShippingInput
  ): Promise<Result<ProductDraftSummary, SetProductShippingError>> {
    const existingProduct = await this.sellerProductQueryRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const validationError = validateShippingPayload(input);

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productCommandRepository.replaceShipping({
      productId,
      shopId: existingProduct.shopId,
      shipping: {
        originCountry: input.originCountry.trim().toUpperCase(),
        originZip: input.originZip.trim(),
        processTimeLabel: input.processTimeLabel.trim(),
        destinations: input.destinations.map((destination, index) => ({
          countryCode: destination.countryCode.trim().toUpperCase(),
          deliveryTimeLabel: destination.deliveryTimeLabel.trim(),
          service: destination.service.trim(),
          chargeType: destination.chargeType,
          rank: index + 1,
        })),
      },
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(product);
  }
}

function validateShippingPayload(
  input: SetProductShippingInput
): InvalidProductVariantConfigurationError | null {
  if (input.originCountry.trim().length !== 2) {
    return new InvalidProductVariantConfigurationError(
      'Origin country must be a 2-letter country code'
    );
  }

  if (input.originZip.trim().length === 0) {
    return new InvalidProductVariantConfigurationError(
      'Origin zip is required'
    );
  }

  if (input.processTimeLabel.trim().length === 0) {
    return new InvalidProductVariantConfigurationError(
      'Process time label is required'
    );
  }

  if (input.destinations.length === 0) {
    return new InvalidProductVariantConfigurationError(
      'At least one shipping destination is required'
    );
  }

  const seenDestinations = new Set<string>();

  for (const destination of input.destinations) {
    const countryCode = destination.countryCode.trim().toUpperCase();

    if (countryCode.length !== 2) {
      return new InvalidProductVariantConfigurationError(
        'Each shipping destination must use a 2-letter country code'
      );
    }

    if (destination.deliveryTimeLabel.trim().length === 0) {
      return new InvalidProductVariantConfigurationError(
        'Each shipping destination requires a delivery time label'
      );
    }

    if (destination.service.trim().length === 0) {
      return new InvalidProductVariantConfigurationError(
        'Each shipping destination requires a service name'
      );
    }

    if (seenDestinations.has(countryCode)) {
      return new InvalidProductVariantConfigurationError(
        `Duplicate shipping destination "${countryCode}" is not allowed`
      );
    }

    seenDestinations.add(countryCode);
  }

  return null;
}
