import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey, appJobName } from '~/integrations/queue/app/app-job.types';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import {
  buildProductInventoryUpdatedSseEvent,
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
} from '../../events/product-inventory-sse.event';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductInventoryInput {
  inventory: Array<{
    productVariantId?: string;
    sku?: string;
    stock: number;
  }>;
}

type SetProductInventoryError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class SetProductInventoryUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly auditLogService: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductInventoryInput,
  ): Promise<Result<ProductDraftSummary, SetProductInventoryError>> {
    const existingProduct = await this.sellerProductQueryRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const validationError = validateInventoryPayload(
      existingProduct.variantType ?? ProductVariantType.NONE,
      existingProduct.variants.map((variant) => variant.id),
      input.inventory,
    );

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productCommandRepository.replaceInventory({
      productId,
      shopId: existingProduct.shopId,
      inventory: input.inventory.map((row) => ({
        productVariantId: row.productVariantId,
        sku: row.sku?.trim() || undefined,
        stock: row.stock,
      })),
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    await this.auditLogService.record({
      action: 'product.inventory.updated',
      entityType: 'product',
      entityId: product.id,
      summary: {
        shopId: product.shopId,
        inventoryRowCount: product.inventory.length,
        variantType: product.variantType,
      },
      actor: {
        actorId: actor.userId,
        actorEmail: actor.email,
        sessionId: actor.sessionId,
      },
    });

    for (const inventory of product.inventory) {
      this.eventEmitter.emit(
        PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
        buildProductInventoryUpdatedSseEvent({
          productId: product.id,
          inventoryId: inventory.id,
          stock: inventory.stock,
        }),
      );
    }
    await this.jobDispatcher?.dispatch(
      appJobName.projectCatalogProduct,
      { productId: product.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
          product.id,
        ),
      },
    );

    return ok(product);
  }
}

function validateInventoryPayload(
  variantType: ProductVariantType,
  variantIds: string[],
  inventory: SetProductInventoryInput['inventory'],
): InvalidProductVariantConfigurationError | null {
  if (inventory.length === 0) {
    return new InvalidProductVariantConfigurationError(
      'At least one inventory row is required',
    );
  }

  const seenSkus = new Set<string>();

  for (const row of inventory) {
    if (row.stock < 0) {
      return new InvalidProductVariantConfigurationError(
        'Inventory stock cannot be negative',
      );
    }

    const sku = row.sku?.trim();
    if (sku) {
      if (seenSkus.has(sku)) {
        return new InvalidProductVariantConfigurationError(
          `Duplicate SKU "${sku}" is not allowed`,
        );
      }
      seenSkus.add(sku);
    }
  }

  if (variantType === ProductVariantType.NONE) {
    if (inventory.length !== 1) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants must define exactly one inventory row',
      );
    }

    if (inventory[0]?.productVariantId) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants cannot reference a product variant',
      );
    }

    return null;
  }

  if (inventory.length !== variantIds.length) {
    return new InvalidProductVariantConfigurationError(
      'Variant-backed products must define exactly one inventory row per variant',
    );
  }

  const providedVariantIds = new Set<string>();

  for (const row of inventory) {
    if (!row.productVariantId) {
      return new InvalidProductVariantConfigurationError(
        'Variant-backed inventory rows must reference a product variant',
      );
    }

    if (!variantIds.includes(row.productVariantId)) {
      return new InvalidProductVariantConfigurationError(
        `Unknown product variant "${row.productVariantId}" in inventory`,
      );
    }

    if (providedVariantIds.has(row.productVariantId)) {
      return new InvalidProductVariantConfigurationError(
        `Duplicate inventory row for variant "${row.productVariantId}" is not allowed`,
      );
    }

    providedVariantIds.add(row.productVariantId);
  }

  return null;
}
