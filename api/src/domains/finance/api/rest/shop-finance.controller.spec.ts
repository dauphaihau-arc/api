import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { ShopFinanceController } from './shop-finance.controller';

describe('ShopFinanceController authorization metadata', () => {
  it('requires shop management permissions for the seller finance endpoint', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopFinanceController),
    ).toEqual(['shops.manage']);
  });
});
