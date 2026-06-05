import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { ListShopOrdersQueryDto } from './list-shop-orders.query.dto';

describe('ListShopOrdersQueryDto', () => {
  it('maps repeated and snake_case query params into the DTO shape', () => {
    const dto = plainToInstance(ListShopOrdersQueryDto, {
      status: ['paid', 'canceled'],
      shipping_status: 'pre_transit,delivered',
      created_from: '2026-06-01T00:00:00.000Z',
      created_to: '2026-06-05T23:59:59.999Z',
      amount_min: '1000',
      amount_max: '5000',
      currency: 'usd,hkd',
      payment_type: ['card', 'cash'],
      search: 'buyer@example.com',
    });

    expect(dto.status).toEqual([OrderStatus.PAID, OrderStatus.CANCELED]);
    expect(dto.shippingStatus).toEqual([
      OrderShippingStatus.PRE_TRANSIT,
      OrderShippingStatus.DELIVERED,
    ]);
    expect(dto.createdFrom).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(dto.createdTo).toEqual(new Date('2026-06-05T23:59:59.999Z'));
    expect(dto.amountMin).toBe(1000);
    expect(dto.amountMax).toBe(5000);
    expect(dto.currency).toEqual(['usd', 'hkd']);
    expect(dto.paymentType).toEqual([PaymentType.CARD, PaymentType.CASH]);
    expect(dto.search).toBe('buyer@example.com');
  });

  it('fails validation for invalid enum filters', () => {
    const dto = plainToInstance(ListShopOrdersQueryDto, {
      status: 'not-a-status',
      payment_type: 'wire',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(2);
  });
});
