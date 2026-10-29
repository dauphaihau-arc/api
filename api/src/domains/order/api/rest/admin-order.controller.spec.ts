import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { AdminOrderController } from './admin-order.controller';
import { toAdminOrderFinancialBreakdownResponse } from './responses/admin-order-financial-breakdown.response';

describe('AdminOrderController authorization metadata', () => {
  it('requires order management permissions for admin order endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, AdminOrderController),
    ).toEqual(['orders.manage']);
  });
});

describe('AdminOrderController financial breakdown endpoint', () => {
  it('is exposed as GET :order_id/financial-breakdown', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminOrderController.prototype.financialBreakdown,
      ),
    ).toBe(':order_id/financial-breakdown');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminOrderController.prototype.financialBreakdown,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('resolves the public id and returns the mapped breakdown for any admin', async () => {
    const resolveOrderPublicId = jest.fn().mockResolvedValue('order-1');
    const execute = jest.fn().mockResolvedValue({
      orderId: 'ord_test1',
      currency: 'USD',
      platformCommissionMinor: 4750,
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
    });
    const getAdminOrderFinancialBreakdownUseCase = { execute };
    const controller = new AdminOrderController(
      {} as never,
      {} as never,
      getAdminOrderFinancialBreakdownUseCase as never,
      {} as never,
      {} as never,
      { resolveOrderPublicId } as never,
    );

    await expect(controller.financialBreakdown('ord_test1')).resolves.toEqual({
      order_id: 'ord_test1',
      currency: 'USD',
      platform_commission_minor: 4750,
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
    expect(resolveOrderPublicId).toHaveBeenCalledWith('ord_test1');
    expect(execute).toHaveBeenCalledWith('order-1');
  });
});

describe('toAdminOrderFinancialBreakdownResponse', () => {
  it('keeps a null commission instead of fabricating zero', () => {
    expect(
      toAdminOrderFinancialBreakdownResponse({
        orderId: 'ord_test1',
        currency: 'USD',
        platformCommissionMinor: null,
        sellerPayableMinor: null,
        availability: { recorded: false, availableAt: null },
        payout: null,
        payoutMethod: {
          accountStatus: 'missing',
          autoPayoutEnabled: false,
          autoPayoutDayOfMonth: 15,
          nextPayoutDate: null,
        },
      }),
    ).toEqual({
      order_id: 'ord_test1',
      currency: 'USD',
      platform_commission_minor: null,
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
});
