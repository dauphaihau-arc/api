import type { ShopRepository } from '../../ports/shop.repository';
import { ListAdminShopsUseCase } from './list-admin-shops.use-case';

describe('ListAdminShopsUseCase', () => {
  it('returns paginated admin shop rows and trims the search term', async () => {
    const rows = [
      {
        id: 'shop_1',
        shopName: 'Acme Goods',
        slug: 'acme-goods',
        status: 'active',
        currency: 'USD' as const,
        productCount: 7,
        ownerEmail: 'owner@example.com',
        ownerName: 'Acme Owner',
        createdAt: new Date('2026-03-12T09:30:00Z'),
      },
    ];
    const findAllForAdmin = jest.fn().mockResolvedValue({
      items: rows,
      totalResults: 41,
    });

    const useCase = new ListAdminShopsUseCase({
      findAllForAdmin,
    } as unknown as ShopRepository);

    const result = await useCase.execute({
      page: 3,
      limit: 20,
      search: '  acme  ',
    });

    expect(findAllForAdmin).toHaveBeenCalledWith({
      page: 3,
      limit: 20,
      search: 'acme',
    });
    expect(result).toEqual({
      results: rows,
      page: 3,
      limit: 20,
      totalPages: 3,
      totalResults: 41,
    });
  });

  it('omits a blank search term and reports at least one page', async () => {
    const findAllForAdmin = jest.fn().mockResolvedValue({
      items: [],
      totalResults: 0,
    });

    const useCase = new ListAdminShopsUseCase({
      findAllForAdmin,
    } as unknown as ShopRepository);

    const result = await useCase.execute({ page: 1, limit: 20, search: '   ' });

    expect(findAllForAdmin).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
    });
    expect(result.totalPages).toBe(1);
    expect(result.totalResults).toBe(0);
  });
});
