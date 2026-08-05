import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { ShopOrderExportController } from './shop-order-export.controller';
import { ShopOrderController } from './shop-order.controller';

describe('ShopOrderController authorization metadata', () => {
  it('requires shop management permissions for seller order endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopOrderController),
    ).toEqual(['shops.manage']);
  });

  it('requires shop management permissions for seller order export endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopOrderExportController),
    ).toEqual(['shops.manage']);
  });
});
