import type { EntityManager } from '@mikro-orm/postgresql';
import type { RequestContextService } from '~/platform/request-context/request-context.service';
import { AuditLogEntity } from '../infra/persistence/entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

function createService() {
  const findAndCount = jest.fn().mockResolvedValue([[], 0]);
  const getRepository = jest.fn().mockReturnValue({ findAndCount });
  const fork = jest.fn().mockReturnValue({ getRepository });

  const service = new AuditLogService(
    { fork } as unknown as EntityManager,
    { get: jest.fn() } as unknown as RequestContextService,
  );

  return { service, findAndCount, getRepository };
}

function searchOr(term: string) {
  return {
    $or: [
      { actorEmail: { $ilike: `%${term}%` } },
      { entityId: { $ilike: `%${term}%` } },
      { entityPublicId: { $ilike: `%${term}%` } },
    ],
  };
}

describe('AuditLogService.query', () => {
  it('maps search to a contains OR over actor email and both entity ids', async () => {
    const { service, findAndCount, getRepository } = createService();

    await service.query({ search: 'ada', page: 1, limit: 20 });

    expect(getRepository).toHaveBeenCalledWith(AuditLogEntity);
    expect(findAndCount).toHaveBeenCalledWith(
      { $and: [searchOr('ada')] },
      {
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 20,
      },
    );
  });

  it('omits search entirely when it is not provided', async () => {
    const { service, findAndCount } = createService();

    await service.query({ page: 2, limit: 10 });

    expect(findAndCount).toHaveBeenCalledWith(
      {},
      {
        orderBy: { createdAt: 'desc' },
        offset: 10,
        limit: 10,
      },
    );
  });

  it('keeps action and entity type ANDed with the search OR', async () => {
    const { service, findAndCount } = createService();

    await service.query({
      entityType: 'order',
      action: 'order.status.overridden',
      search: 'ord_1',
      page: 1,
      limit: 5,
    });

    expect(findAndCount).toHaveBeenCalledWith(
      {
        entityType: 'order',
        action: 'order.status.overridden',
        $and: [searchOr('ord_1')],
      },
      {
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 5,
      },
    );
  });

  it('maps action and entity type lists to $in predicates', async () => {
    const { service, findAndCount } = createService();

    await service.query({
      entityType: ['order', 'product'],
      action: ['order.status.overridden', 'order.refund.updated'],
      page: 1,
      limit: 20,
    });

    expect(findAndCount).toHaveBeenCalledWith(
      {
        entityType: { $in: ['order', 'product'] },
        action: {
          $in: ['order.status.overridden', 'order.refund.updated'],
        },
      },
      {
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 20,
      },
    );
  });

  it('ignores blank entries in filter lists', async () => {
    const { service, findAndCount } = createService();

    await service.query({
      entityType: [' order ', '  '],
      action: '',
      page: 1,
      limit: 20,
    });

    expect(findAndCount).toHaveBeenCalledWith(
      { entityType: { $in: ['order'] } },
      {
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 20,
      },
    );
  });

  it('keeps the legacy actor email and entity id filters ANDed with search', async () => {
    const { service, findAndCount } = createService();

    await service.query({
      actorEmail: 'ada@example.com',
      entityId: 'ord_1',
      search: 'shop_1',
      page: 1,
      limit: 20,
    });

    expect(findAndCount).toHaveBeenCalledWith(
      {
        $and: [
          { actorEmail: { $ilike: '%ada@example.com%' } },
          { $or: [{ entityId: 'ord_1' }, { entityPublicId: 'ord_1' }] },
          searchOr('shop_1'),
        ],
      },
      {
        orderBy: { createdAt: 'desc' },
        offset: 0,
        limit: 20,
      },
    );
  });

  it('maps matching rows into records without changing the envelope', async () => {
    const { service, getRepository } = createService();
    const findAndCount = jest.fn().mockResolvedValue([
      [
        {
          id: 'audit-1',
          action: 'order.status.overridden',
          entityType: 'order',
          entityId: 'order-1',
          entityPublicId: 'ord_1',
          actorEmail: 'ada@example.com',
          requestId: 'request-1',
          summary: { status: 'refunded' },
          createdAt: new Date('2026-05-23T10:00:00.000Z'),
        },
      ],
      1,
    ]);
    getRepository.mockReturnValue({ findAndCount });

    const result = await service.query({ search: 'ord_1', page: 1, limit: 20 });

    expect(result).toEqual({
      records: [
        {
          id: 'audit-1',
          action: 'order.status.overridden',
          entityType: 'order',
          entityId: 'order-1',
          entityPublicId: 'ord_1',
          actorEmail: 'ada@example.com',
          requestId: 'request-1',
          summary: { status: 'refunded' },
          createdAt: new Date('2026-05-23T10:00:00.000Z'),
        },
      ],
      totalResults: 1,
    });
  });
});
