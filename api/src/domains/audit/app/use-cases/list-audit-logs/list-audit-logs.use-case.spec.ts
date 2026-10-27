import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import {
  AUDIT_LOG_EXPORT_ROW_LIMIT,
  ListAuditLogsUseCase,
} from './list-audit-logs.use-case';

function createUseCase(queryAuditLogs: jest.Mock) {
  return new ListAuditLogsUseCase({
    query: queryAuditLogs,
  } as unknown as AuditLogService);
}

describe('ListAuditLogsUseCase', () => {
  it('maps filters, including entity type, into the audit query', async () => {
    const queryAuditLogs = jest.fn().mockResolvedValue({
      records: [
        {
          id: 'audit-1',
          action: 'order.status.overridden',
          entityType: 'order',
          entityId: 'order-1',
          entityPublicId: 'ord_1',
          actorEmail: 'admin@example.com',
          requestId: 'request-1',
          summary: { previousStatus: 'paid', status: 'refunded' },
          createdAt: new Date('2026-05-23T10:00:00.000Z'),
        },
      ],
      totalResults: 21,
    });

    const useCase = createUseCase(queryAuditLogs);

    const result = await useCase.execute({
      page: 2,
      limit: 10,
      action: [' order.status.overridden ', '  '],
      actorEmail: ' admin@example.com ',
      entityId: ' ord_1 ',
      entityType: [' order '],
      search: ' admin ',
    });

    expect(queryAuditLogs).toHaveBeenCalledWith({
      entityType: ['order'],
      action: ['order.status.overridden'],
      actorEmail: 'admin@example.com',
      entityId: 'ord_1',
      search: 'admin',
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({
      results: [
        {
          id: 'audit-1',
          action: 'order.status.overridden',
          entityType: 'order',
          entityId: 'order-1',
          entityPublicId: 'ord_1',
          actorEmail: 'admin@example.com',
          requestId: 'request-1',
          summary: { previousStatus: 'paid', status: 'refunded' },
          createdAt: new Date('2026-05-23T10:00:00.000Z'),
        },
      ],
      page: 2,
      limit: 10,
      totalPages: 3,
      totalResults: 21,
    });
  });

  it('forwards several actions and entity types as lists', async () => {
    const queryAuditLogs = jest.fn().mockResolvedValue({
      records: [],
      totalResults: 0,
    });

    const useCase = createUseCase(queryAuditLogs);

    await useCase.execute({
      page: 1,
      limit: 20,
      action: ['order.status.overridden', 'order.refund.updated'],
      entityType: ['order', 'product'],
    });

    expect(queryAuditLogs).toHaveBeenCalledWith({
      entityType: ['order', 'product'],
      action: ['order.status.overridden', 'order.refund.updated'],
      actorEmail: undefined,
      entityId: undefined,
      search: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('reads every entity type when no filter is given and omits blank filters', async () => {
    const queryAuditLogs = jest.fn().mockResolvedValue({
      records: [],
      totalResults: 0,
    });

    const useCase = createUseCase(queryAuditLogs);

    const result = await useCase.execute({
      page: 1,
      limit: 20,
      action: ['  ', ''],
      actorEmail: '',
      entityId: '   ',
      entityType: ['  '],
      search: '   ',
    });

    expect(queryAuditLogs).toHaveBeenCalledWith({
      entityType: undefined,
      action: undefined,
      actorEmail: undefined,
      entityId: undefined,
      search: undefined,
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({
      results: [],
      page: 1,
      limit: 20,
      totalPages: 1,
      totalResults: 0,
    });
  });

  it('exports RFC 4180 CSV with a compact JSON summary', async () => {
    const queryAuditLogs = jest.fn().mockResolvedValue({
      records: [
        {
          id: 'audit-1',
          action: 'order.status.overridden',
          entityType: 'order',
          entityId: 'order-1',
          entityPublicId: 'ord_1',
          actorEmail: 'admin@example.com',
          requestId: 'request-1',
          summary: { note: 'refunded, manual', status: 'refunded' },
          createdAt: new Date('2026-05-23T10:00:00.000Z'),
        },
        {
          id: 'audit-2',
          action: 'product.updated',
          entityType: 'product',
          entityId: 'product-1',
          actorEmail: 'ad"min@example.com',
          createdAt: new Date('2026-05-23T09:00:00.000Z'),
        },
      ],
      totalResults: 2,
    });

    const useCase = createUseCase(queryAuditLogs);

    const csv = await useCase.exportCsv({
      action: [' order.status.overridden ', 'product.updated'],
      actorEmail: undefined,
      entityId: undefined,
      entityType: [' order ', ' product '],
      search: ' ord_1 ',
    });

    expect(queryAuditLogs).toHaveBeenCalledWith({
      entityType: ['order', 'product'],
      action: ['order.status.overridden', 'product.updated'],
      actorEmail: undefined,
      entityId: undefined,
      search: 'ord_1',
      page: 1,
      limit: AUDIT_LOG_EXPORT_ROW_LIMIT,
    });
    expect(csv).toBe([
      'time,action,entity_type,entity_id,entity_public_id,actor_email,request_id,summary',
      '2026-05-23T10:00:00.000Z,order.status.overridden,order,order-1,ord_1,admin@example.com,request-1,"{""note"":""refunded, manual"",""status"":""refunded""}"',
      '2026-05-23T09:00:00.000Z,product.updated,product,product-1,,"ad""min@example.com",,{}',
    ].join('\r\n'));
  });

  it('caps exports at the maximum row limit', async () => {
    const records = Array.from(
      { length: AUDIT_LOG_EXPORT_ROW_LIMIT + 5 },
      (_, index) => ({
        id: `audit-${index}`,
        action: 'product.updated',
        entityType: 'product',
        entityId: `product-${index}`,
        createdAt: new Date('2026-05-23T10:00:00.000Z'),
      }),
    );
    const queryAuditLogs = jest.fn().mockResolvedValue({
      records,
      totalResults: records.length,
    });

    const useCase = createUseCase(queryAuditLogs);

    const csv = await useCase.exportCsv({});

    expect(queryAuditLogs).toHaveBeenCalledWith({
      entityType: undefined,
      action: undefined,
      actorEmail: undefined,
      entityId: undefined,
      search: undefined,
      page: 1,
      limit: AUDIT_LOG_EXPORT_ROW_LIMIT,
    });
    expect(csv.split('\r\n')).toHaveLength(AUDIT_LOG_EXPORT_ROW_LIMIT + 1);
  });
});
