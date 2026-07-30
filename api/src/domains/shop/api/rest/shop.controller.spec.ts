import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { ShopController } from './shop.controller';

describe('ShopController authorization metadata', () => {
  it('requires explicit permissions for shop endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_PERMISSIONS_KEY,
        ShopController.prototype.createShop,
      ),
    ).toEqual(['shops.create']);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_PERMISSIONS_KEY,
        ShopController.prototype.myShop,
      ),
    ).toEqual(['shops.manage']);
  });
});
