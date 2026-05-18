import type { EntityManager } from '@mikro-orm/postgresql';
import type { MarketPreferences } from '~/config/marketplace.config';

export interface CreateUserPreferenceInput extends MarketPreferences {
  userId: string;
}

export abstract class UserPreferenceRepository {
  abstract create(
    input: CreateUserPreferenceInput,
    entityManager?: EntityManager
  ): Promise<void>;
  abstract findByUserId(userId: string): Promise<MarketPreferences | null>;
}
