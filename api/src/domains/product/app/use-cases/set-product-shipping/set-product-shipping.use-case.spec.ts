import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductShippingUseCase } from './set-product-shipping.use-case';

describe('SetProductShippingUseCase', () => {
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
    inventory: [],
  };

  function buildDeps() {
    const productRepository = {
      findById: jest.fn().mockResolvedValue(product),
      replaceShipping: jest.fn().mockResolvedValue({
        ...product,
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
    };
  }

  it('replaces shipping profile and destinations', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductShippingUseCase(
      productRepository,
      productRepository,
      shopRepository,
    );

    const result = await useCase.execute(actor, product.id, {
      originCountry: 'us',
      originZip: '10001',
      processTimeLabel: '1-3 business days',
      destinations: [
        {
          countryCode: 'us',
          deliveryTimeLabel: '3-5 business days',
          service: 'USPS',
          chargeType: ProductShippingCharge.FREE_SHIPPING,
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.replaceShipping).toHaveBeenCalledWith({
      productId: product.id,
      shopId: product.shopId,
      shipping: {
        originCountry: 'US',
        originZip: '10001',
        processTimeLabel: '1-3 business days',
        destinations: [
          {
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'USPS',
            chargeType: ProductShippingCharge.FREE_SHIPPING,
            rank: 1,
          },
        ],
      },
    });
  });

  it('rejects duplicate destination country codes', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductShippingUseCase(
      productRepository,
      productRepository,
      shopRepository,
    );

    const result = await useCase.execute(actor, product.id, {
      originCountry: 'US',
      originZip: '10001',
      processTimeLabel: '1-3 business days',
      destinations: [
        {
          countryCode: 'US',
          deliveryTimeLabel: '3-5 business days',
          service: 'USPS',
          chargeType: ProductShippingCharge.FREE_SHIPPING,
        },
        {
          countryCode: 'US',
          deliveryTimeLabel: '5-7 business days',
          service: 'UPS',
          chargeType: ProductShippingCharge.FIXED_PRICE,
        },
      ],
    });

    expect(result.isOk).toBe(false);
    expect(productRepository.replaceShipping).not.toHaveBeenCalled();
  });
});
