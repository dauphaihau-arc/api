import { isCatalogShippingAvailable } from './shipping-coverage';

describe('isCatalogShippingAvailable', () => {
  it('treats a matching explicit country as available', () => {
    expect(isCatalogShippingAvailable({
      isDigital: false,
      shipping: {
        shipsToCountryCodes: ['US', 'VN'],
        shipsWorldwide: false,
      },
    }, 'VN')).toBe(true);
  });

  it('normalizes the preview country before matching', () => {
    expect(isCatalogShippingAvailable({
      isDigital: false,
      shipping: {
        shipsToCountryCodes: ['US'],
        shipsWorldwide: false,
      },
    }, ' us ')).toBe(true);
  });

  it('treats an unsupported country as unavailable', () => {
    expect(isCatalogShippingAvailable({
      isDigital: false,
      shipping: {
        shipsToCountryCodes: ['US'],
        shipsWorldwide: false,
      },
    }, 'VN')).toBe(false);
  });

  it('treats worldwide coverage as available in every destination', () => {
    expect(isCatalogShippingAvailable({
      isDigital: false,
      shipping: {
        shipsToCountryCodes: [],
        shipsWorldwide: true,
      },
    }, 'VN')).toBe(true);
  });

  it('keeps a digital product available without any coverage', () => {
    expect(isCatalogShippingAvailable({
      isDigital: true,
      shipping: {
        shipsToCountryCodes: [],
        shipsWorldwide: false,
      },
    }, 'VN')).toBe(true);
  });

  it('treats a physical product without projected coverage as unavailable', () => {
    expect(isCatalogShippingAvailable({ isDigital: false }, 'VN')).toBe(false);
  });

  it('stays available when the request has no Preview Destination', () => {
    expect(isCatalogShippingAvailable({
      isDigital: false,
      shipping: {
        shipsToCountryCodes: [],
        shipsWorldwide: false,
      },
    })).toBe(true);
  });
});
