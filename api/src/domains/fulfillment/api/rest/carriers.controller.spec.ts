import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { CarriersController } from './carriers.controller';

describe('CarriersController', () => {
  it('requires shop management permissions', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, CarriersController),
    ).toEqual(['shops.manage']);
  });

  it('serializes the code-defined catalogue in transport shape', () => {
    const response = new CarriersController().list();

    expect(response.carriers).toEqual([
      {
        code: 'usps',
        name: 'USPS',
        tracking_pattern: '^9\\d{21}$',
        tracking_hint: '22 digits starting with 9',
        observable: true,
        label_supported: true,
      },
      {
        code: 'dhl',
        name: 'DHL',
        tracking_pattern: '^\\d{10}$',
        tracking_hint: '10 digits',
        observable: true,
        label_supported: true,
      },
      {
        code: 'vnpost',
        name: 'VNPOST',
        tracking_pattern: '^[A-Z]{2}\\d{9}VN$',
        tracking_hint: 'two letters, nine digits, then VN',
        observable: true,
        label_supported: true,
      },
      {
        code: 'other',
        name: 'Other',
        tracking_pattern: null,
        tracking_hint: null,
        observable: false,
        label_supported: false,
      },
    ]);
  });
});
