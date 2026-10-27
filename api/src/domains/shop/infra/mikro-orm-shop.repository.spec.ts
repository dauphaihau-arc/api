import type { EntityManager } from '@mikro-orm/postgresql';
import { MikroOrmShopRepository } from './mikro-orm-shop.repository';

function buildShop(id: string) {
  return {
    id,
    publicId: `shop_${id}`,
    shopName: `Shop ${id}`,
    slug: `shop-${id}`,
    status: 'active',
    currency: 'USD',
    createdAt: new Date('2026-01-02T03:04:05Z'),
    ownerUser: {
      email: `${id}@example.com`,
      displayName: `Owner ${id}`,
    },
  };
}

function buildRepository() {
  const findAndCount = jest.fn();
  const execute = jest.fn().mockResolvedValue([]);
  const forked = {
    getRepository: jest.fn(() => ({ findAndCount })),
    getConnection: jest.fn(() => ({ execute })),
    getMetadata: jest.fn(() => ({ tableName: 'products' })),
  };
  const entityManager = {
    fork: jest.fn(() => forked),
  } as unknown as EntityManager;

  return {
    repository: new MikroOrmShopRepository(entityManager),
    findAndCount,
    execute,
  };
}

describe('MikroOrmShopRepository.findAllForAdmin', () => {
  it('counts products for the whole page in one grouped query', async () => {
    const { repository, findAndCount, execute } = buildRepository();
    findAndCount.mockResolvedValue([
      [buildShop('a'), buildShop('b'), buildShop('c')],
      3,
    ]);
    execute.mockResolvedValue([
      { shop_id: 'a', product_count: '3' },
      { shop_id: 'b', product_count: 0 },
    ]);

    const result = await repository.findAllForAdmin({ page: 1, limit: 20 });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('from products');
    expect(sql).toContain('group by shop_id');
    expect(sql).not.toContain('variant');
    expect(params).toEqual(['a', 'b', 'c']);
    expect(result.totalResults).toBe(3);
    expect(result.items.map((item) => item.productCount)).toEqual([3, 0, 0]);
  });

  it('keeps the remainder of the admin row mapping intact', async () => {
    const { repository, findAndCount, execute } = buildRepository();
    findAndCount.mockResolvedValue([[buildShop('a')], 1]);
    execute.mockResolvedValue([{ shop_id: 'a', product_count: 42 }]);

    const result = await repository.findAllForAdmin({ page: 1, limit: 20 });

    expect(result.items[0]).toEqual({
      id: 'shop_a',
      shopName: 'Shop a',
      slug: 'shop-a',
      status: 'active',
      currency: 'USD',
      productCount: 42,
      ownerEmail: 'a@example.com',
      ownerName: 'Owner a',
      createdAt: new Date('2026-01-02T03:04:05Z'),
    });
  });

  it('skips the count query when the page has no shops', async () => {
    const { repository, findAndCount, execute } = buildRepository();
    findAndCount.mockResolvedValue([[], 0]);

    const result = await repository.findAllForAdmin({ page: 2, limit: 20 });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], totalResults: 0 });
  });
});
