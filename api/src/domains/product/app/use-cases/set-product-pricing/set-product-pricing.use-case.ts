import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import { ProductPricingRepository } from '../../ports/product-pricing.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductPricingInput {
  pricing: Array<{
    inventoryId: string;
    amountMinor: number;
    originalAmountMinor?: number;
    currency?: string;
  }>;
}

type SetProductPricingError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class SetProductPricingUseCase {
  constructor(
    private readonly productRepository: SellerProductQueryRepository,
    private readonly productPricingRepository: ProductPricingRepository,
    private readonly shopRepository: ShopRepository,
    private readonly auditLogService: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductPricingInput,
  ): Promise<Result<ProductDraftSummary, SetProductPricingError>> {
    const existingProduct = await this.productRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    const shop = !canManageAnyShop
      ? await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId,
      )
      : await this.shopRepository.findById(existingProduct.shopId);

    if (!shop) {
      return err(new ActorCannotCreateProductDraftError());
    }

    const validationError = validatePricingPayload(existingProduct.inventory, input.pricing);

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productPricingRepository.replacePricing({
      productId,
      pricing: input.pricing.map((row) => ({
        inventoryId: row.inventoryId,
        amountMinor: row.amountMinor,
        originalAmountMinor: row.originalAmountMinor,
        currency: shop.currency,
      })),
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    await this.auditLogService.record({
      action: 'product.pricing.updated',
      entityType: 'product',
      entityId: product.id,
      summary: {
        shopId: product.shopId,
        pricingRowCount: product.inventory.length,
      },
      actor: {
        actorId: actor.userId,
        actorEmail: actor.email,
        sessionId: actor.sessionId,
      },
    });
    await this.jobDispatcher?.dispatch(
      appJobName.projectCatalogProduct,
      { productId: product.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
          product.id,
        ),
      },
    );

    void this.eventEmitter;

    return ok(product);
  }
}

function validatePricingPayload(
  inventory: ProductDraftSummary['inventory'],
  pricing: SetProductPricingInput['pricing'],
): InvalidProductVariantConfigurationError | null {
  if (pricing.length === 0) {
    return new InvalidProductVariantConfigurationError(
      'At least one pricing row is required',
    );
  }

  if (pricing.length !== inventory.length) {
    return new InvalidProductVariantConfigurationError(
      'Pricing rows must match the existing inventory row count',
    );
  }

  const inventoryIds = new Set(inventory.map((row) => row.id));
  const seenInventoryIds = new Set<string>();

  for (const row of pricing) {
    if (!inventoryIds.has(row.inventoryId)) {
      return new InvalidProductVariantConfigurationError(
        `Unknown inventory row "${row.inventoryId}" in pricing`,
      );
    }

    if (seenInventoryIds.has(row.inventoryId)) {
      return new InvalidProductVariantConfigurationError(
        `Duplicate pricing row for inventory "${row.inventoryId}" is not allowed`,
      );
    }

    if (row.amountMinor < 50) {
      return new InvalidProductVariantConfigurationError(
        'Inventory amount_minor must be at least 50',
      );
    }

    if (row.originalAmountMinor !== undefined && row.originalAmountMinor < 0) {
      return new InvalidProductVariantConfigurationError(
        'Inventory original_amount_minor cannot be negative',
      );
    }

    if (row.originalAmountMinor !== undefined && row.originalAmountMinor < row.amountMinor) {
      return new InvalidProductVariantConfigurationError(
        'Inventory original_amount_minor cannot be lower than amount_minor',
      );
    }

    seenInventoryIds.add(row.inventoryId);
  }

  return null;
}
