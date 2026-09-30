import type { EntityManager } from '@mikro-orm/postgresql';
import { PromotionApplicationKind } from '../../../domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '../../../domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '../../../domain/enums/promotion-product-scope.enum';
import { PromotionEntity } from '../entities/promotion.entity';
import { MikroOrmSaleProjectionReader } from './mikro-orm-sale-projection.reader';

function buildPromotion(input: {
  id: string;
  shopId: string;
  percentOff: number;
  productScope: PromotionProductScope;
  productIds?: string[];
}) {
  return {
    id: input.id,
    shop: { id: input.shopId },
    percentOff: input.percentOff,
    productScope: input.productScope,
    products: {
      getItems: () => (input.productIds ?? []).map((productId) => ({ productId })),
    },
  };
}

function buildReader(promotions: object[]) {
  const find = jest.fn().mockResolvedValue(promotions);
  const getRepository = jest.fn().mockReturnValue({ find });
  const entityManager = {
    fork: jest.fn().mockReturnValue({ getRepository }),
  };

  return {
    reader: new MikroOrmSaleProjectionReader(entityManager as unknown as EntityManager),
    getRepository,
    find,
  };
}

describe('MikroOrmSaleProjectionReader', () => {
  it('queries active percentage Sales in the promotion window', async () => {
    const { reader, getRepository, find } = buildReader([]);
    const now = new Date('2026-09-30T00:00:00.000Z');

    await reader.findBestSalesForProducts({
      targets: [{ shopId: 'shop-1', productId: 'product-1' }],
      at: now,
    });

    expect(getRepository).toHaveBeenCalledWith(PromotionEntity);
    expect(find).toHaveBeenCalledWith(
      {
        shop: { $in: ['shop-1'] },
        applicationKind: PromotionApplicationKind.SALE,
        benefitType: PromotionBenefitType.PERCENTAGE,
        startAt: { $lte: now },
        endAt: { $gt: now },
        cancelledAt: null,
        endedAt: null,
        percentOff: { $gt: 0 },
      },
      { populate: ['products'] },
    );
  });

  it('picks the highest matching percentage without compounding', async () => {
    const { reader } = buildReader([
      buildPromotion({
        id: 'sale-20',
        shopId: 'shop-1',
        percentOff: 20,
        productScope: PromotionProductScope.ALL,
      }),
      buildPromotion({
        id: 'sale-30',
        shopId: 'shop-1',
        percentOff: 30,
        productScope: PromotionProductScope.SPECIFIC,
        productIds: ['product-1'],
      }),
    ]);

    const result = await reader.findBestSalesForProducts({
      targets: [{ shopId: 'shop-1', productId: 'product-1' }],
    });

    expect(result.get('product-1')).toEqual({
      promotionId: 'sale-30',
      percentOff: 30,
    });
  });

  it('applies all-scope Sales only within their own shop and specific Sales only to selected products', async () => {
    const { reader } = buildReader([
      buildPromotion({
        id: 'shop-1-all',
        shopId: 'shop-1',
        percentOff: 15,
        productScope: PromotionProductScope.ALL,
      }),
      buildPromotion({
        id: 'shop-1-specific',
        shopId: 'shop-1',
        percentOff: 25,
        productScope: PromotionProductScope.SPECIFIC,
        productIds: ['product-1'],
      }),
    ]);

    const result = await reader.findBestSalesForProducts({
      targets: [
        { shopId: 'shop-1', productId: 'product-1' },
        { shopId: 'shop-1', productId: 'product-2' },
      ],
    });

    expect(result.get('product-1')).toEqual({
      promotionId: 'shop-1-specific',
      percentOff: 25,
    });
    expect(result.get('product-2')).toEqual({
      promotionId: 'shop-1-all',
      percentOff: 15,
    });
  });

  it('returns nothing without targets', async () => {
    const { reader, find } = buildReader([]);

    const result = await reader.findBestSalesForProducts({ targets: [] });

    expect(result.size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});
