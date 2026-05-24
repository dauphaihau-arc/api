import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '~/common/events/user-created.event';
import {
  err,
  Result
} from '~/common/application/result';
import type {
  AuthResponse,
} from '../../auth.types';
import {
  EmailAlreadyRegisteredError,
  InactiveUserError,
  UserNotFoundError
} from '../../errors/auth-app.error';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { PasswordHasher } from '../../ports/password-hasher';
import { UserPreferenceRepository } from '../../ports/user-preference.repository';
import { IssueSessionUseCase } from '../issue-session/issue-session.use-case';
import { normalizeUserPreferences } from '~/config/marketplace.config';
import { toSlug } from '~/common/utils/slugify';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import {
  ShopNameAlreadyTakenError,
  ShopSlugAlreadyTakenError,
  ShopSlugReservedError
} from '~/modules/domains/shop/app/errors/shop-app.error';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { Email } from '../../../domain/value-objects/email';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { RoleKey } from '../../../domain/value-objects/role-key';

const customerRole = {
  key: RoleKey.create('customer'),
  name: 'Customer',
  description: 'Default application customer role',
} as const;

const sellerRole = {
  key: RoleKey.create('seller'),
  name: 'Seller',
  description: 'Marketplace seller role',
} as const;

export interface RegisterSellerInput {
  email: string;
  password: string;
  displayName: string;
  shopName: string;
}

@Injectable()
export class RegisterSellerUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly authUserRepository: AuthUserRepository,
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly shopRepository: ShopRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueSessionUseCase: IssueSessionUseCase,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(input: RegisterSellerInput): Promise<
    Result<
      AuthResponse,
      | EmailAlreadyRegisteredError
      | InactiveUserError
      | UserNotFoundError
      | ShopNameAlreadyTakenError
      | ShopSlugAlreadyTakenError
      | ShopSlugReservedError
    >
  > {
    const email = Email.create(input.email);
    const existingUser = await this.authUserRepository.findByEmail(email);
    const trimmedShopName = input.shopName.trim();
    const slug = toSlug(trimmedShopName);

    if (existingUser) {
      return err(new EmailAlreadyRegisteredError());
    }

    const existingName = await this.shopRepository.findByShopName(
      trimmedShopName
    );

    if (existingName) {
      return err(new ShopNameAlreadyTakenError());
    }

    if (RESERVED_SHOP_SLUGS.has(slug)) {
      return err(new ShopSlugReservedError(slug));
    }

    const existingSlug = await this.shopRepository.findBySlug(slug);

    if (existingSlug) {
      return err(new ShopSlugAlreadyTakenError());
    }

    const passwordHash = PasswordHash.fromPersisted(
      await this.passwordHasher.hash(input.password)
    );
    const userPreferences = normalizeUserPreferences();
    const user = await this.entityManager.transactional(async (entityManager) => {
      await this.authUserRepository.ensureRole(customerRole, entityManager);
      await this.authUserRepository.ensureRole(sellerRole, entityManager);

      const createdUser = await this.authUserRepository.create(
        {
          email,
          displayName: input.displayName?.trim() || undefined,
          status: UserStatus.ACTIVE,
          passwordHash,
          passwordUpdatedAt: new Date(),
        },
        entityManager
      );

      await this.userPreferenceRepository.create(
        {
          userId: createdUser.id,
          ...userPreferences,
        },
        entityManager
      );

      await this.shopRepository.create(
        {
          ownerUserId: createdUser.id,
          shopName: trimmedShopName,
          slug,
        },
        entityManager
      );

      await this.authUserRepository.assignRole(
        createdUser.id,
        customerRole.key,
        entityManager
      );
      await this.authUserRepository.assignRole(
        createdUser.id,
        sellerRole.key,
        entityManager
      );

      return createdUser;
    });

    const authResponse = await this.issueSessionUseCase.execute(user.id);

    this.eventEmitter.emit(
      'user.created',
      new UserCreatedEvent(user.id, user.email.toString(), user.displayName)
    );

    return authResponse;
  }
}

const RESERVED_SHOP_SLUGS = new Set([
  'account',
  'api',
  'c',
  'cart',
  'checkout',
  'login',
  'orders',
  'products',
  'reset',
  'search',
  'shop',
  'shops',
  'signup',
  'success',
]);
