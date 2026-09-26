import { ProductState } from '../../../../product/domain/enums/product-state.enum';
import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import type {
  ProductShippingAssignment,
  ShippingProfileListRepositoryQuery,
  ShippingProfileStatusCounts,
  ShippingProfileSummary,
} from '../../shipping.types';
import { ListShippingProfilesUseCase } from './list-shipping-profiles.use-case';

const shopId = 'shop-1';

function buildProfile(
  overrides: Partial<ShippingProfileSummary> = {},
): ShippingProfileSummary {
  return {
    id: 'profile-1',
    shopId,
    name: 'Standard shipping',
    status: ShippingProfileStatus.ACTIVE,
    version: 1,
    isDefault: false,
    shopCurrency: 'USD',
    processingTimeMinDays: 1,
    processingTimeMaxDays: 3,
    rates: [
      {
        id: 'rate-1',
        position: 1,
        destinationScope: ShippingDestinationScope.COUNTRY,
        destinationCountry: 'US',
        oneItemFeeMinor: 599,
        additionalItemFeeMinor: 199,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildUseCase(
  profiles: ShippingProfileSummary[] = [buildProfile()],
  statusCounts: ShippingProfileStatusCounts = { active: 1, draft: 0, archived: 0 },
  assignments: ProductShippingAssignment[] = [],
) {
  const shippingProfileRepository = {
    listByShop: jest.fn(
      async (_shopId: string, query: ShippingProfileListRepositoryQuery) => ({
        items: profiles.filter((profile) => query.statuses.includes(profile.status)),
        total: profiles.filter((profile) => query.statuses.includes(profile.status)).length,
      }),
    ),
    countByStatus: jest.fn().mockResolvedValue(statusCounts),
  };
  const productShippingAssignmentPort = {
    listByShippingProfileIds: jest.fn().mockResolvedValue(assignments),
  };
  const useCase = new ListShippingProfilesUseCase(
    shippingProfileRepository as never,
    productShippingAssignmentPort as never,
  );

  return { useCase, shippingProfileRepository, productShippingAssignmentPort };
}

describe('ListShippingProfilesUseCase', () => {
  it('lists active and draft profiles when the caller asks for no statuses', async () => {
    const archived = buildProfile({ id: 'profile-2', status: ShippingProfileStatus.ARCHIVED });
    const { useCase, shippingProfileRepository } = buildUseCase(
      [buildProfile(), archived],
      { active: 1, draft: 0, archived: 1 },
    );

    const result = await useCase.execute(shopId, { page: 1, limit: 20 });

    expect(result.isOk && result.value.results.map((view) => view.profile.id))
      .toEqual(['profile-1']);
    expect(shippingProfileRepository.listByShop).toHaveBeenCalledWith(shopId, {
      page: 1,
      limit: 20,
      statuses: [ShippingProfileStatus.ACTIVE, ShippingProfileStatus.DRAFT],
    });
  });

  it('lists archived profiles when they are requested explicitly', async () => {
    const archived = buildProfile({ id: 'profile-2', status: ShippingProfileStatus.ARCHIVED });
    const { useCase } = buildUseCase(
      [buildProfile(), archived],
      { active: 1, draft: 0, archived: 1 },
    );

    const result = await useCase.execute(shopId, {
      page: 1,
      limit: 20,
      statuses: [ShippingProfileStatus.ARCHIVED],
    });

    expect(result.isOk && result.value.results.map((view) => view.profile.id))
      .toEqual(['profile-2']);
  });

  it('reports how many profiles the shop holds per lifecycle state', async () => {
    const { useCase } = buildUseCase([buildProfile()], { active: 3, draft: 2, archived: 4 });

    const result = await useCase.execute(shopId, { page: 1, limit: 20 });

    expect(result.isOk && result.value.statusCounts).toEqual({
      active: 3,
      draft: 2,
      archived: 4,
    });
  });

  it('reports no pages when the shop has no profile in the listed states', async () => {
    const { useCase } = buildUseCase([], { active: 0, draft: 0, archived: 2 });

    const result = await useCase.execute(shopId, { page: 1, limit: 20 });

    expect(result.isOk && result.value).toMatchObject({
      totalPages: 0,
      totalResults: 0,
      results: [],
    });
  });

  it('reports the assigned product count of each listed profile', async () => {
    const { useCase } = buildUseCase([buildProfile()], undefined, [
      { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.DRAFT },
    ]);

    const result = await useCase.execute(shopId, { page: 1, limit: 20 });

    expect(result.isOk && result.value.results[0]).toMatchObject({
      assignedProductCount: 1,
    });
  });
});
