import type { AdminShopListResult } from '../../../app/shop.types';
import { toAdminShopListResponse } from './admin-shop.response';

const result: AdminShopListResult = {
  results: [
    {
      id: 'shop_000000000001',
      shopName: 'Acme Goods',
      slug: 'acme-goods',
      status: 'active',
      currency: 'USD',
      productCount: 12,
      ownerEmail: 'owner@example.com',
      ownerName: 'Acme Owner',
      createdAt: new Date('2024-03-12T00:00:00Z'),
    },
    {
      id: 'shop_000000000002',
      shopName: 'Bare Co',
      slug: 'bare-co',
      status: 'active',
      currency: 'USD',
      productCount: 0,
      ownerEmail: 'bare@example.com',
      ownerName: null,
      createdAt: new Date('2025-07-01T12:00:00Z'),
    },
  ],
  page: 1,
  limit: 20,
  totalPages: 1,
  totalResults: 2,
};

describe('Admin shop list response', () => {
  it('exposes owner name and ISO-8601 creation instant', () => {
    const response = toAdminShopListResponse(result);

    expect(response.results[0]).toEqual({
      id: 'shop_000000000001',
      shop_name: 'Acme Goods',
      slug: 'acme-goods',
      status: 'active',
      currency: 'USD',
      product_count: 12,
      owner_email: 'owner@example.com',
      owner_name: 'Acme Owner',
      created_at: '2024-03-12T00:00:00.000Z',
    });
    expect(response.results[1].owner_name).toBeNull();
    expect(response.results[1].created_at).toBe('2025-07-01T12:00:00.000Z');
  });

  it('maps a shop without products to a zero count', () => {
    expect(toAdminShopListResponse(result).results[1].product_count).toBe(0);
  });

  it('keeps a non-zero product count as a plain number', () => {
    expect(toAdminShopListResponse(result).results[0].product_count).toBe(12);
  });

  it('keeps the pagination envelope unchanged', () => {
    expect(toAdminShopListResponse(result)).toMatchObject({
      page: 1,
      limit: 20,
      total_pages: 1,
      total_results: 2,
    });
  });
});
