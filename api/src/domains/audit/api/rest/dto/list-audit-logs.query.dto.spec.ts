import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ExportAuditLogsQueryDto,
  ListAuditLogsQueryDto,
} from './list-audit-logs.query.dto';

describe('ListAuditLogsQueryDto', () => {
  it('defaults pagination and keeps the entity type filter', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      action: 'order.status.overridden',
      actor_email: 'admin@example.com',
      entity_id: 'ord_1',
      entity_type: 'product',
      search: 'admin@example.com',
    });

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.action).toEqual(['order.status.overridden']);
    expect(dto.actor_email).toBe('admin@example.com');
    expect(dto.entity_id).toBe('ord_1');
    expect(dto.entity_type).toEqual(['product']);
    expect(dto.search).toBe('admin@example.com');
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('splits comma-separated action and entity type lists', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      action: 'order.status.overridden, order.refund.updated',
      entity_type: 'order,product',
    });

    expect(dto.action).toEqual([
      'order.status.overridden',
      'order.refund.updated',
    ]);
    expect(dto.entity_type).toEqual(['order', 'product']);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts repeated params and drops blank segments', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      action: ['order.status.overridden', ' order.refund.updated '],
      entity_type: 'order, ,product,',
    });

    expect(dto.action).toEqual([
      'order.status.overridden',
      'order.refund.updated',
    ]);
    expect(dto.entity_type).toEqual(['order', 'product']);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('leaves absent and blank filters undefined', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      action: '  ,  ',
      entity_type: '',
    });

    expect(dto.action).toBeUndefined();
    expect(dto.entity_type).toBeUndefined();
    expect(validateSync(dto)).toHaveLength(0);

    const absent = plainToInstance(ListAuditLogsQueryDto, {});

    expect(absent.action).toBeUndefined();
    expect(absent.entity_type).toBeUndefined();
    expect(validateSync(absent)).toHaveLength(0);
  });

  it('accepts search without the legacy filters and rejects overlong terms', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      search: 'ada@example.com',
    });

    expect(dto.actor_email).toBeUndefined();
    expect(dto.entity_id).toBeUndefined();
    expect(validateSync(dto)).toHaveLength(0);

    const tooLong = plainToInstance(ListAuditLogsQueryDto, {
      search: 'a'.repeat(201),
    });

    expect(validateSync(tooLong)).toHaveLength(1);

    const tooLongAction = plainToInstance(ListAuditLogsQueryDto, {
      action: `${'a'.repeat(201)},order.refund.updated`,
    });

    expect(validateSync(tooLongAction)).toHaveLength(1);
  });

  it('coerces pagination and enforces the maximum limit', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {
      page: '2',
      limit: '50',
    });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);

    const tooLarge = plainToInstance(ListAuditLogsQueryDto, { limit: '101' });

    expect(validateSync(tooLarge)).toHaveLength(1);
  });
});

describe('ExportAuditLogsQueryDto', () => {
  it('accepts the same filters without pagination', () => {
    const dto = plainToInstance(ExportAuditLogsQueryDto, {
      action: 'order.status.overridden',
      actor_email: 'admin@example.com',
      entity_id: 'ord_1',
      entity_type: 'order',
      search: 'ord_1',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.action).toEqual(['order.status.overridden']);
    expect(dto.actor_email).toBe('admin@example.com');
    expect(dto.entity_id).toBe('ord_1');
    expect(dto.entity_type).toEqual(['order']);
    expect(dto.search).toBe('ord_1');
  });

  it('splits comma-separated lists for action and entity type', () => {
    const dto = plainToInstance(ExportAuditLogsQueryDto, {
      action: 'order.status.overridden,order.refund.updated',
      entity_type: 'order,product',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.action).toEqual([
      'order.status.overridden',
      'order.refund.updated',
    ]);
    expect(dto.entity_type).toEqual(['order', 'product']);
  });

  it('leaves blank lists undefined', () => {
    const dto = plainToInstance(ExportAuditLogsQueryDto, {
      action: ' , ',
      entity_type: '',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.action).toBeUndefined();
    expect(dto.entity_type).toBeUndefined();
  });
});
