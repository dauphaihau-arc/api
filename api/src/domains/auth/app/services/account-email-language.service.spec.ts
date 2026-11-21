import type { UserPreferences } from '~/platform/config/marketplace.config';
import type { AuthUserRepository } from '../ports/auth-user.repository';
import type { UserPreferenceRepository } from '../ports/user-preference.repository';
import type { UserAccount } from '../../domain/models/user-account';
import { RoleKey } from '../../domain/value-objects/role-key';
import { AccountEmailLanguageService } from './account-email-language.service';

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

describe('AccountEmailLanguageService', () => {
  let authUserRepository: jest.Mocked<AuthUserRepository>;
  let userPreferenceRepository: jest.Mocked<UserPreferenceRepository>;
  let service: AccountEmailLanguageService;

  beforeEach(() => {
    authUserRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<AuthUserRepository>;
    userPreferenceRepository = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserPreferenceRepository>;
    service = new AccountEmailLanguageService(
      authUserRepository,
      userPreferenceRepository,
    );
  });

  it('falls back to English when the account does not exist', async () => {
    authUserRepository.findById.mockResolvedValue(null);

    await expect(service.resolve('missing-user')).resolves.toBe('en');
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('uses the buyer language preference for a customer-only account', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('vi'));

    await expect(service.resolve('user-1')).resolves.toBe('vi');
    expect(userPreferenceRepository.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('normalizes a buyer locale preference to its storefront language', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('vi-VN'));

    await expect(service.resolve('user-1')).resolves.toBe('vi');
  });

  it('falls back to English when a buyer has no stored preference', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(null);

    await expect(service.resolve('user-1')).resolves.toBe('en');
  });

  it('falls back to English when a buyer preference is unsupported', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['customer']));
    userPreferenceRepository.findByUserId.mockResolvedValue(buildPreference('fr'));

    await expect(service.resolve('user-1')).resolves.toBe('en');
  });

  it('keeps seller emails English even when the preference is Vietnamese', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['seller']));

    await expect(service.resolve('user-1')).resolves.toBe('en');
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('keeps admin emails English even when the preference is Vietnamese', async () => {
    authUserRepository.findById.mockResolvedValue(buildAccount(['admin']));

    await expect(service.resolve('user-1')).resolves.toBe('en');
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('keeps mixed-role accounts English even when they hold customer access', async () => {
    authUserRepository.findById.mockResolvedValue(
      buildAccount(['customer', 'seller']),
    );

    await expect(service.resolve('user-1')).resolves.toBe('en');
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });
});
