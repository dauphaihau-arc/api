import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductInventoryInput {
  inventory: Array<{
    productVariantId?: string;
    sku?: string;
    stock: number;
    price: number;
    salePrice?: number;
  }>;
}

type SetProductInventoryError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class SetProductInventoryUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductInventoryInput
  ): Promise<Result<ProductDraftSummary, SetProductInventoryError>> {
    const existingProduct = await this.productRepository.findById(productId);

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

    const validationError = validateInventoryPayload(
      existingProduct.variantType ?? ProductVariantType.NONE,
      existingProduct.variants.map((variant) => variant.id),
      input.inventory
    );

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productRepository.replaceInventory({
      productId,
      shopId: existingProduct.shopId,
      inventory: input.inventory.map((row) => ({
        productVariantId: row.productVariantId,
        sku: row.sku?.trim() || undefined,
        stock: row.stock,
        price: row.price,
        salePrice: row.salePrice,
      })),
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(product);
  }
}

function validateInventoryPayload(
  variantType: ProductVariantType,
  variantIds: string[],
  inventory: SetProductInventoryInput['inventory']
): InvalidProductVariantConfigurationError | null {
  if (inventory.length === 0) {
    return new InvalidProductVariantConfigurationError(
      'At least one inventory row is required'
    );
  }

  const seenSkus = new Set<string>();

  for (const row of inventory) {
    if (row.stock < 0) {
      return new InvalidProductVariantConfigurationError(
        'Inventory stock cannot be negative'
      );
    }

    if (row.price < 0.5) {
      return new InvalidProductVariantConfigurationError(
        'Inventory price must be at least 0.5'
      );
    }

    if (row.salePrice !== undefined && row.salePrice < 0) {
      return new InvalidProductVariantConfigurationError(
        'Inventory sale price cannot be negative'
      );
    }

    if (row.salePrice !== undefined && row.salePrice > row.price) {
      return new InvalidProductVariantConfigurationError(
        'Inventory sale price cannot exceed price'
      );
    }

    const sku = row.sku?.trim();
    if (sku) {
      if (seenSkus.has(sku)) {
        return new InvalidProductVariantConfigurationError(
          `Duplicate SKU "${sku}" is not allowed`
        );
      }
      seenSkus.add(sku);
    }
  }

  if (variantType === ProductVariantType.NONE) {
    if (inventory.length !== 1) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants must define exactly one inventory row'
      );
    }

    if (inventory[0]?.productVariantId) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants cannot reference a product variant'
      );
    }

    return null;
  }

  if (inventory.length !== variantIds.length) {
    return new InvalidProductVariantConfigurationError(
      'Variant-backed products must define exactly one inventory row per variant'
    );
  }

  const providedVariantIds = new Set<string>();

  for (const row of inventory) {
    if (!row.productVariantId) {
      return new InvalidProductVariantConfigurationError(
        'Variant-backed inventory rows must reference a product variant'
      );
    }

    if (!variantIds.includes(row.productVariantId)) {
      return new InvalidProductVariantConfigurationError(
        `Unknown product variant "${row.productVariantId}" in inventory`
      );
    }

    if (providedVariantIds.has(row.productVariantId)) {
      return new InvalidProductVariantConfigurationError(
        `Duplicate inventory row for variant "${row.productVariantId}" is not allowed`
      );
    }

    providedVariantIds.add(row.productVariantId);
  }

  return null;
}
