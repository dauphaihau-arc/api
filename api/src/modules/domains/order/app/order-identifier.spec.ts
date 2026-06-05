import { buildOrderIdentifierWhere, buildScopedOrderIdentifierWhere } from './order-identifier';

describe('order-identifier', () => {
  it('queries both id and orderNumber for UUID identifiers', () => {
    expect(buildOrderIdentifierWhere('547062fe-0341-4cca-be54-10b7d3395734')).toEqual({
      $or: [
        { id: '547062fe-0341-4cca-be54-10b7d3395734' },
        { orderNumber: '547062fe-0341-4cca-be54-10b7d3395734' },
      ],
    });
  });

  it('queries only orderNumber for non-UUID identifiers', () => {
    expect(buildOrderIdentifierWhere('ORD-20260604-000004')).toEqual({
      orderNumber: 'ORD-20260604-000004',
    });
  });

  it('preserves scope around non-UUID identifiers', () => {
    expect(buildScopedOrderIdentifierWhere('ORD-20260604-000004', { shop: 'shop-1' })).toEqual({
      $and: [
        { shop: 'shop-1' },
        { orderNumber: 'ORD-20260604-000004' },
      ],
    });
  });
});
