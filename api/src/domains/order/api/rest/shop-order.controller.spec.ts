import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { ShopOrderController } from './shop-order.controller';

describe('ShopOrderController authorization metadata', () => {
  it('requires shop management permissions for seller order endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopOrderController),
    ).toEqual(['shops.manage']);
  });
});
