import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { ProductVariantLifecycleState } from '../../../domain/enums/product-variant-lifecycle-state.enum';
import type { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { PublishProductUseCase } from './publish-product.use-case';

describe('PublishProductUseCase', () => {
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
    publicId: 'public-product-1',
    shopId: 'shop-1',
    shopPublicId: 'public-shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: ProductState.DRAFT,
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
        lifecycleState: ProductVariantLifecycleState.ACTIVE,
        selections: [],
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
    options: [],
    shipping: {
      id: 'profile-1',
      name: 'Standard shipping',
      status: ShippingProfileStatus.ACTIVE,
      version: 1,
      shopCurrency: 'USD',
      shipFromCountry: 'US',
      shipFromPostal: '10001',
      checkoutReady: true,
      readinessIssues: [],
      rates: [
        {
          id: 'rate-1',
          position: 1,
          destinationScope: ShippingDestinationScope.COUNTRY,
          destinationCountry: 'US',
          oneItemFeeMinor: 599,
          additionalItemFeeMinor: 199,
        },
      ],
    },
  };

  function buildDeps(product = readyProduct) {
    const productRepository = {
      findById: jest.fn().mockResolvedValue(product),
      publish: jest.fn().mockResolvedValue({
        status: 'ok',
        product: {
          ...product,
          state: ProductState.ACTIVE,
        },
      }),
    } as unknown as jest.Mocked<
      SellerProductQueryRepository & ProductCommandRepository
    >;

    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPublicId: jest.fn(),
      findByPublicIds: jest.fn(),
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

  it('publishes a product when all required slices are present', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps();
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(true);
    expect(productRepository.publish).toHaveBeenCalledWith(readyProduct.id);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.published',
        entityType: 'product',
        entityId: readyProduct.id,
      }),
    );
  });

  it('rejects publishing when the shipping profile is not checkout-ready', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      shipping: {
        ...readyProduct.shipping!,
        status: ShippingProfileStatus.DRAFT,
        checkoutReady: false,
        readinessIssues: ['draft'],
      },
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(false);
    expect(productRepository.publish).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('rejects publishing a shippable product with no shipping profile', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      shipping: undefined,
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(false);
    expect(productRepository.publish).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('publishes a digital product without a shipping profile', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      isDigital: true,
      shipping: undefined,
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(true);
    expect(productRepository.publish).toHaveBeenCalledWith(readyProduct.id);
  });

  it('publishes a digital product even when its shipping profile is not checkout-ready', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      isDigital: true,
      shipping: {
        ...readyProduct.shipping!,
        readinessIssues: ['draft'],
        checkoutReady: false,
      },
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(true);
  });

  it('rejects publishing when an inventory row has no price yet', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      inventory: [
        {
          id: 'inv-1',
          productVariantId: 'variant-1',
          sku: 'MUG-001',
          stock: 10,
        },
      ],
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      productRepository,
      shopRepository,
      auditLogService,
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(false);
    expect(productRepository.publish).not.toHaveBeenCalled();
  });
});
