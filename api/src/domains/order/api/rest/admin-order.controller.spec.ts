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
      }),
    ).toEqual({
      order_id: 'ord_test1',
      currency: 'USD',
      platform_commission_minor: null,
    });
  });
});
