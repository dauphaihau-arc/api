import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/common/decorators/require-permissions.decorator';
import { AdminOrderController } from './admin-order.controller';

describe('AdminOrderController authorization metadata', () => {
  it('requires order management permissions for admin order endpoints', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, AdminOrderController)
    ).toEqual(['orders.manage']);
  });
});
