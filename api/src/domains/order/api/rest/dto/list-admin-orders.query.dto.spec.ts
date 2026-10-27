import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { ListAdminOrdersQueryDto } from './list-admin-orders.query.dto';

describe('ListAdminOrdersQueryDto', () => {
  it('splits a comma-separated status list', () => {
    const dto = plainToInstance(ListAdminOrdersQueryDto, {
      status: 'paid, completed',
    });

    expect(dto.status).toEqual([OrderStatus.PAID, OrderStatus.COMPLETED]);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('keeps a single status working', () => {
    const dto = plainToInstance(ListAdminOrdersQueryDto, { status: 'paid' });

    expect(dto.status).toEqual([OrderStatus.PAID]);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts repeated params and drops blank segments', () => {
    const dto = plainToInstance(ListAdminOrdersQueryDto, {
      status: ['paid', ' completed '],
    });

    expect(dto.status).toEqual([OrderStatus.PAID, OrderStatus.COMPLETED]);
    expect(validateSync(dto)).toHaveLength(0);

    const padded = plainToInstance(ListAdminOrdersQueryDto, {
      status: 'paid,,completed,',
    });

    expect(padded.status).toEqual([OrderStatus.PAID, OrderStatus.COMPLETED]);
    expect(validateSync(padded)).toHaveLength(0);
  });

  it('leaves absent and blank statuses undefined', () => {
    const dto = plainToInstance(ListAdminOrdersQueryDto, { status: ' , ' });

    expect(dto.status).toBeUndefined();
    expect(validateSync(dto)).toHaveLength(0);

    const absent = plainToInstance(ListAdminOrdersQueryDto, {});

    expect(absent.status).toBeUndefined();
    expect(absent.page).toBe(1);
    expect(absent.limit).toBe(20);
    expect(validateSync(absent)).toHaveLength(0);
  });

  it('rejects unknown statuses', () => {
    const dto = plainToInstance(ListAdminOrdersQueryDto, {
      status: 'paid,not-a-status',
    });

    expect(validateSync(dto)).toHaveLength(1);
  });
});
