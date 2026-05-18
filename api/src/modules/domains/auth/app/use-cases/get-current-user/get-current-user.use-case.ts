import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ShopEntity } from '../../../../shop/infra/persistence/entities/shop.entity';
import { UserPreferenceRepository } from '../../ports/user-preference.repository';
import { AuthenticatedUser, UserProfile } from '../../auth.types';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly entityManager: EntityManager
  ) {}

  async execute(currentUser: AuthenticatedUser): Promise<UserProfile> {
    const [preferences, shop] = await Promise.all([
      this.userPreferenceRepository.findByUserId(currentUser.userId),
      this.entityManager
        .fork()
        .getRepository(ShopEntity)
        .findOne({ ownerUser: currentUser.userId }, { populate: ['ownerUser'] }),
    ]);

    return {
      id: currentUser.userId,
      email: currentUser.email,
      displayName: currentUser.displayName,
      status: currentUser.status,
      sessionId: currentUser.sessionId,
      roles: currentUser.roles,
      permissions: currentUser.permissions,
      ...(preferences ? { preferences } : {}),
      ...(shop
        ? {
          shop: {
            id: shop.id,
            publicId: shop.publicId,
            ownerUserId: shop.ownerUser.id,
            shopName: shop.shopName,
            status: shop.status,
          },
        }
        : {}),
    };
  }
}
