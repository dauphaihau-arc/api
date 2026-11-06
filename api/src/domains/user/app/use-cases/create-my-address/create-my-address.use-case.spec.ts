import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { CreateMyAddressUseCase } from './create-my-address.use-case';
import type { UserAddressRepository } from '../../ports/user-address.repository';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';

describe('CreateMyAddressUseCase', () => {
  const actor = {
    userId: 'user-1',
    email: 'address@example.com',
    displayName: 'Address User',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['customer'],
    permissions: [],
  };

  function buildRepository(): jest.Mocked<UserAddressRepository> {
    return {
      findAllOwnedByUserId: jest.fn(),
      findOwnedById: jest.fn(),
      findOwnedLocationById: jest.fn(),
      countOwnedByUserId: jest.fn().mockResolvedValue(0),
      clearPrimaryForUser: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'address-1',
        userId: input.userId,
        fullName: input.fullName,
        address1: input.address1,
        address2: input.address2,
        city: input.city,
        state: input.stateText ?? '',
        zip: input.zip,
        country: 'United States',
        countryCode: input.countryCode,
        stateCode: input.stateCode,
        stateText: input.stateText,
        phone: input.phone,
        isPrimary: input.isPrimary ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateOwnedById: jest.fn(),
      deleteOwnedById: jest.fn(),
    };
  }

  function buildLocationRepository(): jest.Mocked<LocationReferenceRepository> {
    return {
      findCurrentDatasetVersion: jest.fn(),
      findActiveCountries: jest.fn().mockResolvedValue([
        {
          code: 'US',
          name: 'United States',
          hasAdministrativeAreas: false,
          postalCodeRequired: true,
        },
      ]),
      findActiveCountry: jest.fn().mockResolvedValue(null),
      findAddressRuleOverride: jest.fn().mockResolvedValue(null),
      findActiveAdministrativeAreas: jest.fn().mockResolvedValue(null),
    };
  }

  it('marks the first address as primary even when the client omits the flag', async () => {
    const repository = buildRepository();
    const useCase = new CreateMyAddressUseCase(
      repository,
      buildLocationRepository(),
    );

    const result = await useCase.execute(actor, {
      fullName: 'Taylor',
      address1: '123 Main St',
      city: 'Austin',
      zip: '73301',
      countryCode: 'US',
      phone: '1234567890',
    });

    expect(repository.clearPrimaryForUser).toHaveBeenCalledWith(actor.userId);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: actor.userId,
      isPrimary: true,
    }));
    expect(result.isPrimary).toBe(true);
  });

  it('clears the previous primary address when a new default is requested', async () => {
    const repository = buildRepository();
    repository.countOwnedByUserId.mockResolvedValue(2);
    const useCase = new CreateMyAddressUseCase(
      repository,
      buildLocationRepository(),
    );

    await useCase.execute(actor, {
      fullName: 'Taylor',
      address1: '123 Main St',
      city: 'Austin',
      zip: '73301',
      countryCode: 'US',
      phone: '1234567890',
      isPrimary: true,
    });

    expect(repository.clearPrimaryForUser).toHaveBeenCalledWith(actor.userId);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      isPrimary: true,
    }));
  });
});
