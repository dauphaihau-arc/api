import type { EntityManager } from '@mikro-orm/postgresql';
import type { UserPreferences } from '~/config/marketplace.config';

export interface CreateUserPreferenceInput extends UserPreferences {
  userId: string;
}

export interface SaveUserPreferenceInput extends UserPreferences {
  userId: string;
}

export abstract class UserPreferenceRepository {
  abstract create(
    input: CreateUserPreferenceInput,
    entityManager?: EntityManager
  ): Promise<void>;
  abstract save(
    input: SaveUserPreferenceInput,
    entityManager?: EntityManager
  ): Promise<void>;
  abstract findByUserId(userId: string): Promise<UserPreferences | null>;
}
