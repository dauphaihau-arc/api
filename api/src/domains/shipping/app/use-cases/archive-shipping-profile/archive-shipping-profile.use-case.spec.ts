import { ProductState } from '../../../../product/domain/enums/product-state.enum';
import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  ShippingProfileInUseError,
  ShippingProfileNotFoundError,
  ShippingProfileVersionConflictError,
} from '../../errors/shipping-app.error';
import type { ProductShippingAssignment, ShippingProfileSummary } from '../../shipping.types';
import type { ShippingProfileTransitionOutcome } from '../../ports/shipping-profile.repository';
import { ArchiveShippingProfileUseCase } from './archive-shipping-profile.use-case';

const shopId = 'shop-1';

function buildProfile(
  overrides: Partial<ShippingProfileSummary> = {},
): ShippingProfileSummary {
  return {
    id: 'profile-1',
    shopId,
    name: 'Standard shipping',
    status: ShippingProfileStatus.ACTIVE,
    version: 4,
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
  profile: ShippingProfileSummary | null,
  assignments: ProductShippingAssignment[] = [],
  archiveOutcome: ShippingProfileTransitionOutcome | null = null,
) {
  const archived = profile
    ? { ...profile, status: ShippingProfileStatus.ARCHIVED, version: profile.version + 1 }
    : null;
  const shippingProfileRepository = {
    findById: jest.fn().mockResolvedValue(profile),
    archive: jest.fn().mockResolvedValue(
      archiveOutcome ?? (archived ? { status: 'ok', profile: archived } : { status: 'version_conflict' }),
    ),
  };
  const productShippingAssignmentPort = {
    listByShippingProfileIds: jest.fn().mockResolvedValue(assignments),
  };
  const useCase = new ArchiveShippingProfileUseCase(
    shippingProfileRepository as never,
    productShippingAssignmentPort as never,
  );

  return { useCase, shippingProfileRepository, productShippingAssignmentPort };
}

describe('ArchiveShippingProfileUseCase', () => {
  it('archives a profile that no published Product depends on', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile(), [
      { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.DRAFT },
    ]);

    const result = await useCase.execute(shopId, 'profile-1');

    expect(result.isOk).toBe(true);
    expect(shippingProfileRepository.archive).toHaveBeenCalledWith({
      shopId,
      shippingProfileId: 'profile-1',
      expectedVersion: 4,
    });
    expect(result.isOk && result.value).toMatchObject({
      profile: { status: ShippingProfileStatus.ARCHIVED },
      assignedProductCount: 1,
      checkoutReady: false,
      readinessIssues: ['archived'],
    });
  });

  it('refuses to archive a profile that published Products still depend on', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(
      buildProfile(),
      [
        { productId: 'product-1', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
        { productId: 'product-2', shippingProfileId: 'profile-1', productState: ProductState.ACTIVE },
      ],
      { status: 'published_products_reference', publishedProductCount: 2 },
    );

    const result = await useCase.execute(shopId, 'profile-1');

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileInUseError);
    expect(result.isOk || (result.error as ShippingProfileInUseError).assignedProductCount).toBe(2);
    // The reference guard runs inside the repository transaction under the
    // profile row lock, so it is re-checked atomically with the transition.
    expect(shippingProfileRepository.archive).toHaveBeenCalledWith({
      shopId,
      shippingProfileId: 'profile-1',
      expectedVersion: 4,
    });
  });

  it('is idempotent for an already archived profile', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(
      buildProfile({ status: ShippingProfileStatus.ARCHIVED }),
    );

    const result = await useCase.execute(shopId, 'profile-1');

    expect(result.isOk).toBe(true);
    expect(shippingProfileRepository.archive).not.toHaveBeenCalled();
  });

  it('reports a missing profile', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute(shopId, 'profile-missing');

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileNotFoundError);
  });

  it('reports a version conflict when the profile changed since it was read', async () => {
    const { useCase, shippingProfileRepository } = buildUseCase(buildProfile());
    shippingProfileRepository.archive.mockResolvedValue({ status: 'version_conflict' });

    const result = await useCase.execute(shopId, 'profile-1');

    expect(result.isOk).toBe(false);
    expect(result.isOk || result.error).toBeInstanceOf(ShippingProfileVersionConflictError);
  });
});
