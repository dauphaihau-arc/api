import { Injectable } from '@nestjs/common';
import { normalizeUserPreferences, type UserPreferencesInput } from '~/config/marketplace.config';
import type { AuthenticatedUser, UserProfile } from '../../auth.types';
import { UserPreferenceRepository } from '../../ports/user-preference.repository';
import { GetCurrentUserUseCase } from '../get-current-user/get-current-user.use-case';

export interface UpdateCurrentUserPreferencesInput {
  preferences: UserPreferencesInput;
}

@Injectable()
export class UpdateCurrentUserPreferencesUseCase {
  constructor(
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async execute(
    currentUser: AuthenticatedUser,
    input: UpdateCurrentUserPreferencesInput,
  ): Promise<UserProfile> {
    const currentPreferences = await this.userPreferenceRepository.findByUserId(currentUser.userId);
    const preferences = normalizeUserPreferences({
      ...currentPreferences,
      ...input.preferences,
    });

    await this.userPreferenceRepository.save({
      userId: currentUser.userId,
      ...preferences,
    });

    return this.getCurrentUserUseCase.execute(currentUser);
  }
}
