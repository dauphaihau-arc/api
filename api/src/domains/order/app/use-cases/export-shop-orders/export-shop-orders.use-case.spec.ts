import 'reflect-metadata';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { ShopOrderExportColumnPreset } from '../../../api/rest/dto/export-shop-orders.query.dto';
import type { ShopOrderExportQueryRepository } from '../../ports/shop-order-export-query.repository';
import { ExportShopOrdersUseCase } from './export-shop-orders.use-case';

describe('ExportShopOrdersUseCase', () => {
  it('exports selected order columns as escaped CSV', async () => {
    const row = {
      id: 'order-1',
      orderNumber: 'ORD-1',
      shop: {
        id: 'shop-1',
        shopName: '=Formula Shop',
      },
      shopId: 'shop-1',
      shopName: '=Formula Shop',
      customerEmail: 'buyer@example.com',
      customerFullName: 'Buyer One',
      status: OrderStatus.PAID,
      paymentType: PaymentType.CARD,
      refundStatus: 'pending',
      currency: 'USD',
      subtotalMinor: 1000,
      shippingMinor: 200,
      discountMinor: 0,
      totalMinor: 1200,
      promoCodes: ['SAVE10'],
      shippingStatus: OrderShippingStatus.PRE_TRANSIT,
      shippingToCountry: 'US',
      shippingOriginCountries: ['VN', 'US'],
      trackingNumber: undefined,
      shippingCarrier: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      note: 'seller "note"',
      customerSupportNote: undefined,
      shipmentNote: undefined,
      refundedAt: undefined,
      createdAt: new Date('2026-08-04T01:02:03.000Z'),
    };
    const exportQueryRepository = {
      listForExport: jest.fn().mockResolvedValue([row]),
    } as unknown as jest.Mocked<ShopOrderExportQueryRepository>;
    const useCase = new ExportShopOrdersUseCase(exportQueryRepository);

    const result = await useCase.execute('shop-1', {
      page: 1,
      limit: 20,
      timezone: 'UTC',
      columnPreset: ShopOrderExportColumnPreset.CUSTOM,
      columns: [
        'id',
        'created_at',
        'customer_full_name',
        'refund_status',
        'note',
        'shop_name',
      ],
    });

    expect(exportQueryRepository.listForExport).toHaveBeenCalledWith(
      'shop-1',
      {
        page: 1,
        limit: 20,
        timezone: 'UTC',
        columnPreset: ShopOrderExportColumnPreset.CUSTOM,
        columns: [
          'id',
          'created_at',
          'customer_full_name',
          'refund_status',
          'note',
          'shop_name',
        ],
      },
      10_000,
    );
    expect(result.csv).toBe([
      '"ID","Created date (UTC)","Customer full name","Refund status","Seller note","Shop name"',
      '"order-1","2026-08-04T01:02:03.000Z","Buyer One","pending","seller ""note""","\'=Formula Shop"',
    ].join('\r\n'));
  });
});
