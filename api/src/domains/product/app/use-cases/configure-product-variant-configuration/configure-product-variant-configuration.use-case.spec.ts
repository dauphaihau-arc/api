import { ProductVersionConflictError } from '../../errors/product-app.error';
import { ConfigureProductVariantConfigurationUseCase } from './configure-product-variant-configuration.use-case';

function buildProduct() {
  return {
    id: 'product-1',
    shopId: 'shop-1',
    title: 'Product',
    slug: 'product',
    description: 'Product description',
    state: 'draft',
    productVersion: 17,
    whoMade: 'i_did',
    isDigital: false,
    nonTaxable: false,
    images: [],
    attributes: [],
    options: [],
    variants: [],
    inventory: [],
  };
}

describe('ConfigureProductVariantConfigurationUseCase', () => {
  it('checks stale versions with a lean mutation target before loading the conflict product', async () => {
    const product = buildProduct();
    const sellerProductQueryRepository = {
      findMutationTargetById: jest.fn().mockResolvedValue({
        id: product.id,
        shopId: product.shopId,
        productVersion: product.productVersion,
      }),
      findById: jest.fn().mockResolvedValue(product),
    };
    const productCommandRepository = {
      configureVariantConfiguration: jest.fn(),
    };
    const shopRepository = {
      findOwnedById: jest.fn().mockResolvedValue({ id: product.shopId }),
    };
    const useCase = new ConfigureProductVariantConfigurationUseCase(
      sellerProductQueryRepository as never,
      productCommandRepository as never,
      shopRepository as never,
    );

    const result = await useCase.execute({
      userId: 'seller-1',
      email: 'seller@example.com',
      roles: [],
      permissions: [],
      sessionId: 'session-1',
      status: 'active',
    } as never, product.id, {
      shopId: product.shopId,
      productVersion: 16,
      options: [],
      variants: [],
      removedVariantIds: [],
      restoreVariantIds: [],
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(result.error).toBeInstanceOf(ProductVersionConflictError);
    expect(sellerProductQueryRepository.findMutationTargetById).toHaveBeenCalledWith(product.id);
    expect(sellerProductQueryRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCommandRepository.configureVariantConfiguration).not.toHaveBeenCalled();
  });

  it('does not accept a product through the wrong shop route', async () => {
    const sellerProductQueryRepository = {
      findMutationTargetById: jest.fn().mockResolvedValue({
        id: 'product-1',
        shopId: 'actual-shop',
        productVersion: 3,
      }),
      findById: jest.fn(),
    };
    const useCase = new ConfigureProductVariantConfigurationUseCase(
      sellerProductQueryRepository as never,
      { configureVariantConfiguration: jest.fn() } as never,
      { findOwnedById: jest.fn() } as never,
    );

    const result = await useCase.execute({ roles: ['admin'] } as never, 'product-1', {
      shopId: 'route-shop',
      productVersion: 3,
      options: [],
      variants: [],
      removedVariantIds: [],
      restoreVariantIds: [],
    });

    expect(result.isOk).toBe(false);
    expect(sellerProductQueryRepository.findById).not.toHaveBeenCalled();
  });
});
