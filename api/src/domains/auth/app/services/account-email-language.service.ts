import { Injectable } from '@nestjs/common';
import {
  DEFAULT_STOREFRONT_LANGUAGE,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import { normalizeStorefrontLanguage } from '~/platform/localization/storefront-language';
import { isBuyerAccount } from '../access/buyer-account';
import { AuthUserRepository } from '../ports/auth-user.repository';
import { UserPreferenceRepository } from '../ports/user-preference.repository';

/**
 * Resolves the language for account emails. Only Buyer Accounts follow their
 * current Buyer Language Preference; seller and back-office accounts, plus
 * missing accounts, stay English.
 */
@Injectable()
export class AccountEmailLanguageService {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly userPreferenceRepository: UserPreferenceRepository,
  ) {}

  async resolve(userId: string): Promise<StorefrontLanguage> {
    const account = await this.authUserRepository.findById(userId);

    if (!account) {
      return DEFAULT_STOREFRONT_LANGUAGE;
    }

    const roles = account.roles.map((role) => role.toString());

    if (!isBuyerAccount(roles)) {
      return DEFAULT_STOREFRONT_LANGUAGE;
    }

    const preference = await this.userPreferenceRepository.findByUserId(userId);

    return normalizeStorefrontLanguage(preference?.language);
  }
}
