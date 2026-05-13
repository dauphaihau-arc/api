import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/common/decorators/require-permissions.decorator';
import { ShopController } from './shop.controller';

describe('ShopController authorization metadata', () => {
  it('does not require an explicit permission to create a shop', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopController)
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_PERMISSIONS_KEY,
        ShopController.prototype.createShop
      )
    ).toBeUndefined();
  });
});
