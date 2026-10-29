import { NotFoundException } from '@nestjs/common';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { OrderNotFoundError } from '~/domains/order/app/errors/order-app.error';
import type { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import type { OrderPublicIdLookup } from '~/domains/order/app/services/order-public-id-lookup.service';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type {
  GetShopOrderPayoutUseCase,
  ShopOrderPayout,
} from '../../app/use-cases/get-shop-order-payout/get-shop-order-payout.use-case';
import { ShopFinanceController } from './shop-finance.controller';

const USER = { userId: 'user-1', email: 'seller@example.com' } as AuthenticatedUser;

function createController(options: {
  shopId?: string;
  orderId?: string;
  payout?: ShopOrderPayout;
}) {
  const resolveManageableShopByPublicId = jest
    .fn()
    .mockResolvedValue({ id: options.shopId ?? 'shop-1' });
  const resolveOrderPublicId = jest
    .fn()
    .mockResolvedValue(options.orderId ?? 'order-1');
  const execute = jest.fn().mockResolvedValue(options.payout);

  const controller = new ShopFinanceController(
    { resolveManageableShopByPublicId } as unknown as ShopAccessService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { execute } as unknown as GetShopOrderPayoutUseCase,
    { resolveOrderPublicId } as unknown as OrderPublicIdLookup,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { countries: [] } as never,
  );

  return {
    controller,
    resolveManageableShopByPublicId,
    resolveOrderPublicId,
    execute,
  };
}

describe('ShopFinanceController authorization metadata', () => {
  it('requires shop management permissions for the seller finance endpoint', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopFinanceController),
    ).toEqual(['shops.manage']);
  });
});

describe('ShopFinanceController order payout', () => {
  it('resolves the manageable shop and the order public id before reading the payout facts', async () => {
    const {
      controller,
      resolveManageableShopByPublicId,
      resolveOrderPublicId,
      execute,
    } = createController({
      payout: {
        orderId: 'ord_test1',
        currency: 'USD',
        sellerPayableMinor: 2_500,
        availability: {
          recorded: true,
          availableAt: new Date('2026-11-02T10:00:00.000Z'),
        },
        payout: {
          id: 'pay_1',
          state: 'paid',
          amountMinor: 2_500,
          paidAt: new Date('2026-11-03T09:00:00.000Z'),
        },
        payoutMethod: {
          accountStatus: 'active',
          autoPayoutEnabled: true,
          autoPayoutDayOfMonth: 15,
          nextPayoutDate: '2026-11-15',
        },
      },
    });

    await expect(
      controller.orderPayout(USER, 'shop_1', 'ord_test1'),
    ).resolves.toEqual({
      order_id: 'ord_test1',
      currency: 'USD',
      seller_payable_minor: 2_500,
      availability: {
        recorded: true,
        available_at: '2026-11-02T10:00:00.000Z',
      },
      payout: {
        id: 'pay_1',
        state: 'paid',
        amount_minor: 2_500,
        paid_at: '2026-11-03T09:00:00.000Z',
      },
      payout_method: {
        account_status: 'active',
        auto_payout_enabled: true,
        auto_payout_day_of_month: 15,
        next_payout_date: '2026-11-15',
      },
    });
    expect(resolveManageableShopByPublicId).toHaveBeenCalledWith(USER, 'shop_1');
    expect(resolveOrderPublicId).toHaveBeenCalledWith('ord_test1');
    expect(execute).toHaveBeenCalledWith({ shopId: 'shop-1', orderId: 'order-1' });
  });

  it('maps an Order with no availability or Payout to null facts', async () => {
    const { controller } = createController({
      payout: {
        orderId: 'ord_test1',
        currency: 'EUR',
        sellerPayableMinor: null,
        availability: { recorded: false, availableAt: null },
        payout: null,
        payoutMethod: {
          accountStatus: 'missing',
          autoPayoutEnabled: false,
          autoPayoutDayOfMonth: 15,
          nextPayoutDate: null,
        },
      },
    });

    await expect(
      controller.orderPayout(USER, 'shop_1', 'ord_test1'),
    ).resolves.toEqual({
      order_id: 'ord_test1',
      currency: 'EUR',
      seller_payable_minor: null,
      availability: { recorded: false, available_at: null },
      payout: null,
      payout_method: {
        account_status: 'missing',
        auto_payout_enabled: false,
        auto_payout_day_of_month: 15,
        next_payout_date: null,
      },
    });
  });

  it('maps a missing order public id to the same not-found error as a foreign order', async () => {
    const { controller, resolveOrderPublicId } = createController({ payout: undefined });
    resolveOrderPublicId.mockRejectedValue(new NotFoundException('Order was not found'));

    await expect(
      controller.orderPayout(USER, 'shop_1', 'ord_missing'),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
