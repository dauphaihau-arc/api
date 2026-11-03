import {
  CARRIER_CATALOGUE,
  findCarrier,
  isObservableCarrier,
  isValidCarrierTrackingNumber,
} from './carrier-catalogue';

describe('carrier catalogue', () => {
  it('defines the four supported carriers with their observable and label capabilities', () => {
    expect(
      CARRIER_CATALOGUE.map((carrier) => ({
        code: carrier.code,
        name: carrier.name,
        trackingPattern: carrier.trackingPattern?.source ?? null,
        trackingHint: carrier.trackingHint ?? null,
        observable: carrier.observable,
        labelSupported: carrier.labelSupported,
      })),
    ).toEqual([
      {
        code: 'usps',
        name: 'USPS',
        trackingPattern: '^9\\d{21}$',
        trackingHint: '22 digits starting with 9',
        observable: true,
        labelSupported: true,
      },
      {
        code: 'dhl',
        name: 'DHL',
        trackingPattern: '^\\d{10}$',
        trackingHint: '10 digits',
        observable: true,
        labelSupported: true,
      },
      {
        code: 'vnpost',
        name: 'VNPOST',
        trackingPattern: '^[A-Z]{2}\\d{9}VN$',
        trackingHint: 'two letters, nine digits, then VN',
        observable: true,
        labelSupported: true,
      },
      {
        code: 'other',
        name: 'Other',
        trackingPattern: null,
        trackingHint: null,
        observable: false,
        labelSupported: false,
      },
    ]);
  });

  it('looks up a carrier by its stored code and rejects unknown codes', () => {
    expect(findCarrier('usps')?.name).toBe('USPS');
    expect(findCarrier('  dhl  ')?.name).toBe('DHL');
    expect(findCarrier('vnpost')?.name).toBe('VNPOST');
    expect(findCarrier('other')?.name).toBe('Other');
    expect(findCarrier('fedex')).toBeUndefined();
    expect(findCarrier('USPS')).toBeUndefined();
    expect(findCarrier('')).toBeUndefined();
    expect(findCarrier(undefined)).toBeUndefined();
  });

  it('matches a tracking number against the carrier pattern', () => {
    const usps = findCarrier('usps')!;
    expect(isValidCarrierTrackingNumber(usps, '9400111899223100001234')).toBe(true);
    expect(isValidCarrierTrackingNumber(usps, '940011189922310000123')).toBe(false);
    expect(isValidCarrierTrackingNumber(usps, '8400111899223100001234')).toBe(false);

    const dhl = findCarrier('dhl')!;
    expect(isValidCarrierTrackingNumber(dhl, '1234567890')).toBe(true);
    expect(isValidCarrierTrackingNumber(dhl, '123456789')).toBe(false);

    const vnpost = findCarrier('vnpost')!;
    expect(isValidCarrierTrackingNumber(vnpost, 'EA123456789VN')).toBe(true);
    expect(isValidCarrierTrackingNumber(vnpost, 'EA123456789US')).toBe(false);
  });

  it('accepts any non-empty tracking number for a carrier without a pattern', () => {
    const other = findCarrier('other')!;
    expect(isValidCarrierTrackingNumber(other, 'ARBITRARY-123')).toBe(true);
    expect(isValidCarrierTrackingNumber(other, '9')).toBe(true);
    expect(isValidCarrierTrackingNumber(other, '   ')).toBe(false);
  });

  it('treats only catalogue carriers as observable', () => {
    expect(isObservableCarrier('usps')).toBe(true);
    expect(isObservableCarrier('  dhl  ')).toBe(true);
    expect(isObservableCarrier('vnpost')).toBe(true);
    expect(isObservableCarrier('other')).toBe(false);
    expect(isObservableCarrier('fedex')).toBe(false);
    expect(isObservableCarrier('')).toBe(false);
    expect(isObservableCarrier(undefined)).toBe(false);
  });
});
