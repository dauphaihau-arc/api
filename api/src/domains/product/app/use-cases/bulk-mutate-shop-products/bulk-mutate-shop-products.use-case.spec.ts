import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductVariantLifecycleState } from '../../../domain/enums/product-variant-lifecycle-state.enum';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import {
  BulkMutateShopProductsAction,
  BulkMutateShopProductsUseCase,
} from './bulk-mutate-shop-products.use-case';

describe('BulkMutateShopProductsUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const readyProduct: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: ProductState.DRAFT,
    productVersion: 1,
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    images: [
      {
        id: 'img-1',
        storageKey: 'products/p1/images/1.jpg',
        rank: 1,
        variantStatus: 'completed',
      },
    ],
    attributes: [],
    variants: [
      {
        id: 'variant-1',
        rank: 1,
        selections: [],
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
      },
    ],
    inventory: [
      {
        id: 'inv-1',
        productVariantId: 'variant-1',
        sku: 'MUG-001',
        stock: 10,
        amountMinor: 1999,
        currency: 'USD',
      },
    ],
    shipping: {
      id: 'shipping-1',
      originCountry: 'US',
      originZip: '10001',
      processTimeLabel: '1-3 business days',
      destinations: [
        {
          id: 'destination-1',
          countryCode: 'US',
          deliveryTimeLabel: '3-5 business days',
          service: 'USPS',
          chargeType: ProductShippingCharge.FREE_SHIPPING,
          rank: 1,
        },
      ],
    },
  };

  function buildDeps(productOverrides: Record<string, ProductDraftSummary> = {}) {
    const products = new Map<string, ProductDraftSummary>([
      [readyProduct.id, readyProduct],
      ...Object.entries(productOverrides),
    ]);

    const productRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => products.get(id) ?? null),
      updateState: jest.fn().mockImplementation(async (id: string, state: ProductState) => {
        const product = products.get(id);

        if (!product) {
          return null;
        }

        const updatedProduct = {
          ...product,
          state,
          productVersion: (product.productVersion ?? 1) + 1,
          removedAt: state === ProductState.REMOVED ? new Date('2026-03-01T00:00:00.000Z') : product.removedAt,
          variants: state === ProductState.REMOVED
            ? product.variants.map((variant) => ({
              ...variant,
              lifecycleState: ProductVariantLifecycleState.REMOVED,
              removedAt: new Date('2026-03-01T00:00:00.000Z'),
            }))
            : product.variants,
        };
        products.set(id, updatedProduct);
        return updatedProduct;
      }),
      publish: jest.fn().mockImplementation(async (id: string) => {
        const product = products.get(id);

        if (!product) {
          return null;
        }

        const updatedProduct = {
          ...product,
          state: ProductState.ACTIVE,
          productVersion: (product.productVersion ?? 1) + 1,
          publishedAt: product.publishedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        };
        products.set(id, updatedProduct);
        return updatedProduct;
      }),
    } as unknown as jest.Mocked<
      SellerProductQueryRepository & ProductCommandRepository
    >;

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
      }),
    };

    return {
      productRepository,
      shopRepository,
      auditLogService: {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<AuditLogService>,
    };
  }

  it('publishes each ready product and collects successful ids', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      'product-2': {
        ...readyProduct,
        id: 'product-2',
        slug: 'handmade-mug-2',
      },
    });
    const useCase = new BulkMutateShopProductsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      productIds: ['product-1', 'product-2'],
      action: BulkMutateShopProductsAction.PUBLISH,
    });

    expect(result).toEqual({
      succeededIds: ['product-1', 'product-2'],
      failed: [],
    });
    expect(productRepository.publish).toHaveBeenCalledTimes(2);
    expect(auditLogService.record).toHaveBeenCalledTimes(2);
  });

  it('returns per-item failures without aborting the whole batch', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      'product-2': {
        ...readyProduct,
        id: 'product-2',
        shipping: undefined,
      },
    });
    const useCase = new BulkMutateShopProductsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      productIds: ['product-1', 'product-2', 'missing-product'],
      action: BulkMutateShopProductsAction.PUBLISH,
    });

    expect(result.succeededIds).toEqual(['product-1']);
    expect(result.failed).toEqual([
      {
        id: 'product-2',
        code: 'ProductNotReadyToPublishError',
        reason: 'Shipping configuration is required before publishing',
      },
      {
        id: 'missing-product',
        code: 'ProductNotFoundError',
        reason: 'Product "missing-product" was not found',
      },
    ]);
    expect(productRepository.publish).toHaveBeenCalledTimes(1);
  });

  it('deactivates previously published products by updating their state', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      'product-1': {
        ...readyProduct,
        state: ProductState.ACTIVE,
      },
      'product-2': {
        ...readyProduct,
        id: 'product-2',
        state: ProductState.ACTIVE,
      },
    });
    const useCase = new BulkMutateShopProductsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      productIds: ['product-1', 'product-2'],
      action: BulkMutateShopProductsAction.DEACTIVATE,
    });

    expect(result).toEqual({
      succeededIds: ['product-1', 'product-2'],
      failed: [],
    });
    expect(productRepository.updateState).toHaveBeenCalledWith(
      'product-1',
      ProductState.INACTIVE,
    );
    expect(productRepository.updateState).toHaveBeenCalledWith(
      'product-2',
      ProductState.INACTIVE,
    );
  });

  it('rejects deactivating draft products', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps();
    const useCase = new BulkMutateShopProductsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      productIds: ['product-1'],
      action: BulkMutateShopProductsAction.DEACTIVATE,
    });

    expect(result).toEqual({
      succeededIds: [],
      failed: [
        {
          id: 'product-1',
          code: 'ProductStateConflict',
          reason: 'Draft products cannot be deactivated before they are published',
        },
      ],
    });
    expect(productRepository.updateState).not.toHaveBeenCalled();
  });

  it('removes a Product as a retained tombstone and cascades removed state to variants', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      'product-1': {
        ...readyProduct,
        state: ProductState.ACTIVE,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const useCase = new BulkMutateShopProductsUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      productIds: ['product-1'],
      action: BulkMutateShopProductsAction.REMOVE,
    });

    expect(result).toEqual({
      succeededIds: ['product-1'],
      failed: [],
    });
    expect(productRepository.updateState).toHaveBeenCalledWith(
      'product-1',
      ProductState.REMOVED,
    );
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'product.removed',
      summary: expect.objectContaining({
        state: ProductState.REMOVED,
      }),
    }));
  });
});
