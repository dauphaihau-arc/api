import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { AdminShopController } from './admin-shop.controller';

describe('AdminShopController authorization metadata', () => {
  it('requires order management permissions rather than shop management', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, AdminShopController),
    ).toEqual(['orders.manage']);
  });
});
