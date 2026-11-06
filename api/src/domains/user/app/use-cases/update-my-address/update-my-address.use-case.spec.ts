import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { UpdateMyAddressUseCase } from './update-my-address.use-case';
import type { UserAddressRepository } from '../../ports/user-address.repository';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';

describe('UpdateMyAddressUseCase', () => {
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
      findOwnedLocationById: jest.fn().mockResolvedValue({
        countryCode: 'US',
        stateCode: 'US-TX',
        countryText: null,
        stateText: null,
        phone: '1234567890',
        zip: '73301',
      }),
      countOwnedByUserId: jest.fn(),
      clearPrimaryForUser: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      updateOwnedById: jest.fn().mockResolvedValue({
        id: 'address-1',
        userId: actor.userId,
        fullName: 'Taylor',
        address1: '123 Main St',
        city: 'Austin',
        state: 'Texas',
        zip: '73301',
        country: 'United States',
        countryCode: 'US',
        stateCode: 'US-TX',
        stateText: null,
        phone: '1234567890',
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      deleteOwnedById: jest.fn(),
    };
  }

  it('clears the current primary before promoting another address', async () => {
    const repository = buildRepository();
    const locationRepository: jest.Mocked<LocationReferenceRepository> = {
      findCurrentDatasetVersion: jest.fn(),
      findActiveCountries: jest.fn().mockResolvedValue([]),
      findActiveCountry: jest.fn().mockResolvedValue(null),
      findAddressRuleOverride: jest.fn().mockResolvedValue(null),
      findActiveAdministrativeAreas: jest.fn().mockResolvedValue(null),
    };
    const useCase = new UpdateMyAddressUseCase(repository, locationRepository);

    await useCase.execute(actor, 'address-1', { isPrimary: true });

    expect(repository.clearPrimaryForUser).toHaveBeenCalledWith(
      actor.userId,
      'address-1',
    );
    expect(repository.updateOwnedById).toHaveBeenCalledWith(
      actor.userId,
      'address-1',
      { isPrimary: true },
    );
  });
});
