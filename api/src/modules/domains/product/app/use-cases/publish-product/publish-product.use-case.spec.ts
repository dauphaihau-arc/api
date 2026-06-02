import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { AuditLogService } from '~/modules/shared/audit/app/audit-log.service';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { ProductRepository } from '../../ports/product.repository';
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
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: ProductState.DRAFT,
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: 'none' as ProductDraftSummary['variantType'],
    images: [
      {
        id: 'img-1',
        storageKey: 'products/p1/images/1.jpg',
        rank: 1,
        variantStatus: 'completed',
      },
    ],
    attributes: [],
    variants: [],
    inventory: [
      {
        id: 'inv-1',
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

  function buildDeps(product = readyProduct) {
    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(product),
      findPublicByShopSlugAndProductSlug: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      updateState: jest.fn(),
      publish: jest.fn().mockResolvedValue({
        ...product,
        state: ProductState.ACTIVE,
      }),
      findByShopIdAndSlug: jest.fn(),
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
      shopRepository,
      auditLogService
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(true);
    expect(productRepository.publish).toHaveBeenCalledWith(readyProduct.id);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product.published',
        entityType: 'product',
        entityId: readyProduct.id,
      })
    );
  });

  it('rejects publishing when shipping is missing', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      shipping: undefined,
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      shopRepository,
      auditLogService
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(false);
    expect(productRepository.publish).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('rejects publishing when an inventory row has no price yet', async () => {
    const { productRepository, shopRepository, auditLogService } = buildDeps({
      ...readyProduct,
      inventory: [
        {
          id: 'inv-1',
          sku: 'MUG-001',
          stock: 10,
        },
      ],
    });
    const useCase = new PublishProductUseCase(
      productRepository,
      shopRepository,
      auditLogService
    );

    const result = await useCase.execute(actor, readyProduct.id);

    expect(result.isOk).toBe(false);
    expect(productRepository.publish).not.toHaveBeenCalled();
  });
});
