import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromotionStatus } from '~/domains/promotion/domain/enums/promotion-status.enum';
import type { ShopSaleSummary } from '../../../app/shop.types';
import { toShopSaleResponse, toShopSaleStopListResponse } from './shop-sale.response';

const sale: ShopSaleSummary = {
  id: 'internal-promotion',
  publicId: 'prm_000000000001',
  shopId: 'internal-shop',
  shopPublicId: 'shop_000000000002',
  name: 'Sale',
  percentOff: 20,
  productScope: PromotionProductScope.SPECIFIC,
  productIds: ['internal-product'],
  productPublicIds: ['prod_000000000003'],
  currency: 'USD',
  startAt: new Date('2026-01-01T00:00:00Z'),
  endAt: new Date('2026-01-02T00:00:00Z'),
  timezone: 'UTC',
  status: PromotionStatus.ENDED,
  cancelledAt: null,
  endedAt: new Date('2026-01-01T12:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T12:00:00Z'),
};

describe('Sale public response references', () => {
  it('maps all public entity references into ordinary fields', () => {
    expect(toShopSaleResponse(sale)).toMatchObject({
      id: 'prm_000000000001',
      shop: 'shop_000000000002',
      product_ids: ['prod_000000000003'],
    });
    expect(JSON.stringify(toShopSaleResponse(sale))).not.toContain('internal-');
  });

  it('retains public references in bulk outcomes', () => {
    expect(toShopSaleStopListResponse({
      results: [sale],
      succeededIds: [sale.publicId],
      failed: [{ id: 'prm_000000000004', code: 'NotFound', reason: 'Sale not found' }],
    })).toMatchObject({
      succeeded_ids: ['prm_000000000001'],
      failed: [{ id: 'prm_000000000004' }],
    });
  });
});
