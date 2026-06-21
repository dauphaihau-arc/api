import type { UserPreferences } from '~/config/marketplace.config';
import type { AuthenticatedUser } from '../../auth.types';
import type { UserPreferenceRepository } from '../../ports/user-preference.repository';
import type { GetCurrentUserUseCase } from '../get-current-user/get-current-user.use-case';
import { UpdateCurrentUserPreferencesUseCase } from './update-current-user-preferences.use-case';

describe('UpdateCurrentUserPreferencesUseCase', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    status: 'active' as never,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  it('merges partial preferences with existing preferences before saving', async () => {
    const userPreferenceRepository: jest.Mocked<UserPreferenceRepository> = {
      create: jest.fn(),
      save: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue({
        region: 'Vietnam',
        language: 'fr',
        currency: 'VND',
      }),
    };
    const expectedProfile = {
      id: currentUser.userId,
      email: currentUser.email,
      displayName: currentUser.displayName,
      status: currentUser.status,
      sessionId: currentUser.sessionId,
      roles: currentUser.roles,
      permissions: currentUser.permissions,
      preferences: {
        region: 'Vietnam',
        language: 'fr',
        currency: 'USD',
      },
    };
    const getCurrentUserUseCase = {
      execute: jest.fn().mockResolvedValue(expectedProfile),
    } as unknown as jest.Mocked<GetCurrentUserUseCase>;
    const useCase = new UpdateCurrentUserPreferencesUseCase(
      userPreferenceRepository,
      getCurrentUserUseCase,
    );

    const result = await useCase.execute(currentUser, {
      preferences: {
        currency: 'USD',
      },
    });

    expect(userPreferenceRepository.save).toHaveBeenCalledWith({
      userId: currentUser.userId,
      region: 'Vietnam',
      language: 'fr',
      currency: 'USD',
    });
    expect(getCurrentUserUseCase.execute).toHaveBeenCalledWith(currentUser);
    expect(result).toEqual(expectedProfile);
  });

  it('falls back to defaults when the user has no stored preferences yet', async () => {
    const userPreferenceRepository: jest.Mocked<UserPreferenceRepository> = {
      create: jest.fn(),
      save: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue(null),
    };
    const expectedPreferences: UserPreferences = {
      region: 'United States',
      language: 'en',
      currency: 'USD',
    };
    const getCurrentUserUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: currentUser.userId,
        email: currentUser.email,
        displayName: currentUser.displayName,
        status: currentUser.status,
        sessionId: currentUser.sessionId,
        roles: currentUser.roles,
        permissions: currentUser.permissions,
        preferences: expectedPreferences,
      }),
    } as unknown as jest.Mocked<GetCurrentUserUseCase>;
    const useCase = new UpdateCurrentUserPreferencesUseCase(
      userPreferenceRepository,
      getCurrentUserUseCase,
    );

    await useCase.execute(currentUser, {
      preferences: {
        region: 'Vietnam',
      },
    });

    expect(userPreferenceRepository.save).toHaveBeenCalledWith({
      userId: currentUser.userId,
      region: 'Vietnam',
      language: 'en',
      currency: 'USD',
    });
  });
});
