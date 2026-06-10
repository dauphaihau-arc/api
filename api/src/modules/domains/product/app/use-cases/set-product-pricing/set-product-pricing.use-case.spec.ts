import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { AuditLogService } from '~/modules/shared/audit/app/audit-log.service';
import type { ProductPricingRepository } from '../../ports/product-pricing.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductPricingUseCase } from './set-product-pricing.use-case';

describe('SetProductPricingUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const product: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    images: [],
    attributes: [],
    variants: [],
    inventory: [
      {
        id: 'inventory-1',
        sku: 'MUG-001',
        stock: 10,
        amountMinor: 1999,
        currency: 'USD',
      },
    ],
  };

  function buildDeps() {
    const productRepository: Pick<jest.Mocked<SellerProductQueryRepository>, 'findById'> = {
      findById: jest.fn().mockResolvedValue(product),
    };

    const productPricingRepository: jest.Mocked<ProductPricingRepository> = {
      replacePricing: jest.fn().mockResolvedValue({
        ...product,
        inventory: [
          {
            ...product.inventory[0],
            amountMinor: 1999,
            originalAmountMinor: 2450,
            currency: 'USD',
          },
        ],
      }),
    };

    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findByShopName: jest.fn(),
      findBySlug: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        slug: 'owner-shop',
        status: 'active',
        currency: 'JPY',
      }),
    };

    return {
      productRepository,
      productPricingRepository,
      shopRepository,
      auditLogService: {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<AuditLogService>,
      eventEmitter: {
        emit: jest.fn(),
      } as unknown as Pick<jest.Mocked<EventEmitter2>, 'emit'>,
    };
  }

  it('replaces pricing for an existing inventory row', async () => {
    const { productRepository, productPricingRepository, shopRepository, auditLogService, eventEmitter } = buildDeps();
    const useCase = new SetProductPricingUseCase(
      productRepository as never,
      productPricingRepository,
      shopRepository,
      auditLogService,
      eventEmitter as unknown as EventEmitter2
    );

    const result = await useCase.execute(actor, product.id, {
      pricing: [
        {
          inventoryId: 'inventory-1',
          amountMinor: 1999,
          originalAmountMinor: 2450,
          currency: 'JPY',
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(productPricingRepository.replacePricing).toHaveBeenCalledWith({
      productId: product.id,
      pricing: [
        {
          inventoryId: 'inventory-1',
          amountMinor: 1999,
          originalAmountMinor: 2450,
          currency: 'JPY',
        },
      ],
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.pricing.updated',
        entityId: product.id,
      })
    );
  });

  it('rejects pricing rows that do not match existing inventory rows', async () => {
    const { productRepository, productPricingRepository, shopRepository, auditLogService, eventEmitter } = buildDeps();
    const useCase = new SetProductPricingUseCase(
      productRepository as never,
      productPricingRepository,
      shopRepository,
      auditLogService,
      eventEmitter as unknown as EventEmitter2
    );

    const result = await useCase.execute(actor, product.id, {
      pricing: [
        {
          inventoryId: 'inventory-2',
          amountMinor: 2450,
          currency: 'IGNORED',
        },
      ],
    });

    expect(result.isOk).toBe(false);
    expect(productPricingRepository.replacePricing).not.toHaveBeenCalled();
  });
});
