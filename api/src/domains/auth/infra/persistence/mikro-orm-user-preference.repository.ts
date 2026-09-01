import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  normalizeUserPreferences,
  type UserPreferences,
} from '~/platform/config/marketplace.config';
import {
  CreateUserPreferenceInput,
  SaveUserPreferenceInput,
  UserPreferenceRepository,
} from '../../app/ports/user-preference.repository';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';

@Injectable()
export class MikroOrmUserPreferenceRepository implements UserPreferenceRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async create(
    input: CreateUserPreferenceInput,
    entityManager?: EntityManager,
  ): Promise<void> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(UserEntity);
    const userPreferenceRepository = em.getRepository(UserPreferenceEntity);
    const user = await userRepository.findOneOrFail({ id: input.userId });
    const userPreference = userPreferenceRepository.create({
      user,
      region: input.region,
      language: input.language,
      currency: input.currency,
    });

    await em.persistAndFlush(userPreference);
  }

  async save(
    input: SaveUserPreferenceInput,
    entityManager?: EntityManager,
  ): Promise<void> {
    const em = entityManager ?? this.entityManager.fork();
    const userRepository = em.getRepository(UserEntity);
    const userPreferenceRepository = em.getRepository(UserPreferenceEntity);
    const user = await userRepository.findOneOrFail({ id: input.userId });
    const existingPreference = await userPreferenceRepository.findOne({ user: input.userId });

    if (existingPreference) {
      existingPreference.region = input.region;
      existingPreference.language = input.language;
      existingPreference.currency = input.currency;
      await em.flush();
      return;
    }

    const userPreference = userPreferenceRepository.create({
      user,
      region: input.region,
      language: input.language,
      currency: input.currency,
    });

    await em.persistAndFlush(userPreference);
  }

  async findByUserId(userId: string): Promise<UserPreferences | null> {
    const repository = this.entityManager.fork().getRepository(UserPreferenceEntity);
    const preference = await repository.findOne({ user: userId });

    if (!preference) {
      return null;
    }

    return normalizeUserPreferences({
      region: preference.region,
      language: preference.language,
      currency: preference.currency,
    });
  }
}
