import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { ShopProductAccessService } from './shop-product-access.service';
import type { SellerProductQueryRepository } from '../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../product.types';

describe('ShopProductAccessService', () => {
  const actor = { userId: 'seller-1', roles: [] } as unknown as AuthenticatedUser;

  function build() {
    const shopAccessService = { resolveManageableShopByPublicId: jest.fn() };
    const sellerProductQueryRepository = { findByPublicId: jest.fn() };
    const service = new ShopProductAccessService(
      shopAccessService as unknown as ShopAccessService,
      sellerProductQueryRepository as unknown as SellerProductQueryRepository,
    );

    return { service, shopAccessService, sellerProductQueryRepository };
  }

  it('returns the product when the actor manages the shop and the product belongs to it', async () => {
    const { service, shopAccessService, sellerProductQueryRepository } = build();
    const product = { id: 'product-1', publicId: 'prod_1', shopId: 'shop-1' } as ProductDraftSummary;
    shopAccessService.resolveManageableShopByPublicId.mockResolvedValue({ id: 'shop-1' });
    sellerProductQueryRepository.findByPublicId.mockResolvedValue(product);

    await expect(
      service.resolveManageableProduct(actor, 'shop_1', 'prod_1'),
    ).resolves.toBe(product);
  });

  it('hides a product that belongs to another shop', async () => {
    const { service, shopAccessService, sellerProductQueryRepository } = build();
    shopAccessService.resolveManageableShopByPublicId.mockResolvedValue({ id: 'shop-1' });
    sellerProductQueryRepository.findByPublicId.mockResolvedValue({
      id: 'product-1',
      publicId: 'prod_1',
      shopId: 'shop-2',
    } as ProductDraftSummary);

    await expect(
      service.resolveManageableProduct(actor, 'shop_1', 'prod_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides an unknown product', async () => {
    const { service, shopAccessService, sellerProductQueryRepository } = build();
    shopAccessService.resolveManageableShopByPublicId.mockResolvedValue({ id: 'shop-1' });
    sellerProductQueryRepository.findByPublicId.mockResolvedValue(null);

    await expect(
      service.resolveManageableProduct(actor, 'shop_1', 'prod_missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses before loading the product when the actor cannot manage the shop', async () => {
    const { service, shopAccessService, sellerProductQueryRepository } = build();
    shopAccessService.resolveManageableShopByPublicId.mockRejectedValue(
      new Error('You do not own this shop'),
    );

    await expect(
      service.resolveManageableProduct(actor, 'shop_1', 'prod_1'),
    ).rejects.toThrow('You do not own this shop');
    expect(sellerProductQueryRepository.findByPublicId).not.toHaveBeenCalled();
  });
});
