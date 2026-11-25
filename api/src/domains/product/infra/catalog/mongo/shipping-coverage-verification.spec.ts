import { verifyCatalogShippingCoverage } from './shipping-coverage-verification';

describe('catalog shipping coverage verification', () => {
  it('accepts reprojected physical and digital documents', () => {
    const report = verifyCatalogShippingCoverage([
      {
        productId: 'product-1',
        isDigital: false,
        shipping: {
          shipsToCountryCodes: ['US', 'VN'],
          shipsWorldwide: false,
        },
      },
      {
        productId: 'product-2',
        isDigital: false,
        shipping: {
          shipsToCountryCodes: [],
          shipsWorldwide: true,
        },
      },
      {
        productId: 'product-3',
        isDigital: true,
        shipping: {
          shipsToCountryCodes: [],
          shipsWorldwide: false,
        },
      },
      {
        productId: 'product-4',
        isDigital: true,
      },
    ]);

    expect(report).toMatchObject({
      totalDocuments: 4,
      invalidDocuments: 0,
      issues: [],
    });
  });

  it('flags physical documents written before shipping coverage was projected', () => {
    const report = verifyCatalogShippingCoverage([{
      productId: 'legacy-product',
      isDigital: false,
    }]);

    expect(report.invalidDocuments).toBe(1);
    expect(report.issues[0]).toEqual({
      productId: 'legacy-product',
      fields: ['shipping'],
    });
  });

  it('flags malformed country codes and a non-boolean worldwide flag', () => {
    const report = verifyCatalogShippingCoverage([{
      productId: 'product-1',
      isDigital: false,
      shipping: {
        shipsToCountryCodes: ['us', 'USA', 'US', 'US'],
        shipsWorldwide: 'yes',
      },
    }]);

    expect(report.issues[0]?.fields).toEqual([
      'shipping.shipsToCountryCodes',
      'shipping.shipsWorldwide',
    ]);
  });

  it('accepts a physical document with no coverage as unsupported, not malformed', () => {
    const report = verifyCatalogShippingCoverage([{
      productId: 'product-1',
      isDigital: false,
      shipping: {
        shipsToCountryCodes: [],
        shipsWorldwide: false,
      },
    }]);

    expect(report).toMatchObject({
      totalDocuments: 1,
      invalidDocuments: 0,
      issues: [],
    });
  });

  it('ignores documents the storefront never lists', () => {
    const report = verifyCatalogShippingCoverage([{
      productId: 'removed-product',
      state: 'removed',
      isDigital: false,
    }]);

    expect(report.invalidDocuments).toBe(0);
  });
});
