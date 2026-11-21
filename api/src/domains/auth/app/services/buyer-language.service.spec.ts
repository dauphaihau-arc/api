import type { UserPreferences } from '~/platform/config/marketplace.config';
import type { AuthUserRepository } from '../ports/auth-user.repository';
import type { UserPreferenceRepository } from '../ports/user-preference.repository';
import type { UserAccount } from '../../domain/models/user-account';
import { RoleKey } from '../../domain/value-objects/role-key';
import { BuyerLanguageService } from './buyer-language.service';

function buildAccount(roles: string[]): UserAccount {
  return {
    id: 'user-1',
    version: 1,
    roles: roles.map((role) => RoleKey.create(role)),
  } as unknown as UserAccount;
}

function buildPreference(language: string): UserPreferences {
  return {
    region: 'United States',
    language,
    currency: 'USD',
  } as unknown as UserPreferences;
}

describe('BuyerLanguageService', () => {
  let authUserRepository: jest.Mocked<AuthUserRepository>;
  let userPreferenceRepository: jest.Mocked<UserPreferenceRepository>;
  let service: BuyerLanguageService;

  beforeEach(() => {
    authUserRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<AuthUserRepository>;
    userPreferenceRepository = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserPreferenceRepository>;
    service = new BuyerLanguageService(
      authUserRepository,
      userPreferenceRepository,
    );
  });

  it('classifies a missing account as non-buyer and English', async () => {
    authUserRepository.findById.mockResolvedValue(null);

    await expect(service.resolve('missing-user')).resolves.toEqual({
      isBuyer: false,
      language: 'en',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('uses the buyer language preference for a customer-only account', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('vi'));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: true,
      language: 'vi',
    });
    expect(userPreferenceRepository.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('normalizes a buyer locale preference to its storefront language', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('vi-VN'));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: true,
      language: 'vi',
    });
  });

  it('falls back to English when a buyer has no stored preference', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(null);

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: true,
      language: 'en',
    });
  });

  it('falls back to English when a buyer preference is unsupported', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('fr'));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: true,
      language: 'en',
    });
  });

  it('classifies an account without roles as non-buyer and English', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount([]));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: false,
      language: 'en',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('keeps seller accounts non-buyer and English', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['seller']));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: false,
      language: 'en',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('keeps admin accounts non-buyer and English', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['admin']));

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: false,
      language: 'en',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('keeps mixed-role accounts non-buyer and English', async () => {
    authUserRepository.findById.mockResolvedValue(
      buildAccount(['customer', 'seller']),
    );

    await expect(service.resolve('user-1')).resolves.toEqual({
      isBuyer: false,
      language: 'en',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });
});
