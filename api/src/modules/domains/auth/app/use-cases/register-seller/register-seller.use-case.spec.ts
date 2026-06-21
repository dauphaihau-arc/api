import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { UserCreatedEvent } from '~/common/events/user-created.event';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import type { UserAccount } from '../../../domain/models/user-account';
import { Email } from '../../../domain/value-objects/email';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { RoleKey } from '../../../domain/value-objects/role-key';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { AuthUserRepository } from '../../ports/auth-user.repository';
import type { PasswordHasher } from '../../ports/password-hasher';
import type { UserPreferenceRepository } from '../../ports/user-preference.repository';
import type { IssueSessionUseCase } from '../issue-session/issue-session.use-case';
import { RegisterSellerUseCase } from './register-seller.use-case';

describe('RegisterSellerUseCase', () => {
  it('creates seller-capable users with customer and seller roles', async () => {
    const createdUser: UserAccount = {
      id: 'user-1',
      version: 1,
      email: Email.create('seller@example.com'),
      displayName: 'Seller User',
      status: UserStatus.ACTIVE,
      passwordHash: PasswordHash.fromPersisted(
        '$2b$04$123456789012345678901u8QTs4lJx0pK7ydjXfQ6PS/UPTzQ0zQG',
      ),
      passwordUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      roles: [RoleKey.create('customer'), RoleKey.create('seller')],
      permissions: [],
    };
    const entityManager = {
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<UserAccount>) =>
        callback({} as EntityManager)),
    } as unknown as EntityManager;

    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(createdUser),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn().mockResolvedValue(undefined),
      ensureRole: jest.fn().mockResolvedValue(undefined),
    };
    const userPreferenceRepository: jest.Mocked<UserPreferenceRepository> = {
      create: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      findByUserId: jest.fn(),
    };
    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: 'user-1',
        shopName: 'Seller Shop',
        slug: 'seller-shop',
        status: 'active',
        currency: 'USD',
      }),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findByShopName: jest.fn().mockResolvedValue(null),
      findBySlug: jest.fn().mockResolvedValue(null),
      findOwnedById: jest.fn(),
    };
    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest
        .fn()
        .mockResolvedValue(
          '$2b$04$123456789012345678901u8QTs4lJx0pK7ydjXfQ6PS/UPTzQ0zQG',
        ),
      matches: jest.fn(),
    };
    const issueSessionUseCase: jest.Mocked<IssueSessionUseCase> = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: {
            id: 'user-1',
            email: 'seller@example.com',
            displayName: 'Seller User',
            status: UserStatus.ACTIVE,
            sessionId: 'session-1',
            roles: ['customer', 'seller'],
            permissions: ['shops.create', 'shops.manage'],
          },
        },
      }),
    } as unknown as jest.Mocked<IssueSessionUseCase>;
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };

    const useCase = new RegisterSellerUseCase(
      entityManager,
      authUserRepository,
      userPreferenceRepository,
      shopRepository,
      passwordHasher,
      issueSessionUseCase,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await useCase.execute({
      email: 'seller@example.com',
      password: 'password123',
      displayName: 'Seller User',
      shopName: 'Seller Shop',
      currency: 'EUR',
    });

    expect(result.isOk).toBe(true);
    expect(userPreferenceRepository.create).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        region: 'United States',
        language: 'en',
        currency: 'EUR',
      },
      expect.anything(),
    );
    expect(shopRepository.create).toHaveBeenCalledWith(
      {
        ownerUserId: 'user-1',
        shopName: 'Seller Shop',
        slug: 'seller-shop',
        currency: 'EUR',
      },
      expect.anything(),
    );
    expect(authUserRepository.assignRole).toHaveBeenNthCalledWith(
      1,
      'user-1',
      RoleKey.create('customer'),
      expect.anything(),
    );
    expect(authUserRepository.assignRole).toHaveBeenNthCalledWith(
      2,
      'user-1',
      RoleKey.create('seller'),
      expect.anything(),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'user.created',
      expect.objectContaining<UserCreatedEvent>({
        userId: 'user-1',
        email: 'seller@example.com',
        displayName: 'Seller User',
      }),
    );
  });
});
