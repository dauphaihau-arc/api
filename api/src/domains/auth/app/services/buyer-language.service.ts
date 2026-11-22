import { Injectable } from '@nestjs/common';
import {
  DEFAULT_STOREFRONT_LANGUAGE,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import { normalizeStorefrontLanguage } from '~/platform/localization/storefront-language';
import { isBuyerAccount } from '../access/buyer-account';
import { AuthUserRepository } from '../ports/auth-user.repository';
import { UserPreferenceRepository } from '../ports/user-preference.repository';

export interface BuyerLanguage {
  isBuyer: boolean;
  language: StorefrontLanguage;
}

/**
 * Resolves who a user is for outbound messaging and which language they read.
 * Only Buyer Accounts follow their current Buyer Language Preference; seller
 * and back-office accounts, plus missing accounts, stay English.
 */
@Injectable()
export class BuyerLanguageService {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly userPreferenceRepository: UserPreferenceRepository,
  ) {}

  async resolve(userId: string): Promise<BuyerLanguage> {
    const account = await this.authUserRepository.findById(userId);

    if (!account) {
      return { isBuyer: false, language: DEFAULT_STOREFRONT_LANGUAGE };
    }

    const roles = account.roles.map((role) => role.toString());

    if (!isBuyerAccount(roles)) {
      return { isBuyer: false, language: DEFAULT_STOREFRONT_LANGUAGE };
    }

    const preference = await this.userPreferenceRepository.findByUserId(userId);

    return {
      isBuyer: true,
      language: normalizeStorefrontLanguage(preference?.language),
    };
  }
}
