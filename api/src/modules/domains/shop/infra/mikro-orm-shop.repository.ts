import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ShopRepository } from '../app/ports/shop.repository';
import type { CreateShopInput, ShopSummary } from '../app/shop.types';
import { CurrentUserEntity } from '../../auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from './persistence/entities/shop.entity';

@Injectable()
export class MikroOrmShopRepository implements ShopRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async create(input: CreateShopInput): Promise<ShopSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ShopEntity);
    const shop = repository.create({
      ownerUser: entityManager.getReference(CurrentUserEntity, input.ownerUserId),
      shopName: input.shopName,
      status: 'active',
    });

    await entityManager.persistAndFlush(shop);
    await entityManager.populate(shop, ['ownerUser']);

    return this.toSummary(shop);
  }

  async findById(id: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne({ id }, { populate: ['ownerUser'] });

    return shop ? this.toSummary(shop) : null;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { ownerUser: ownerUserId },
      { populate: ['ownerUser'] }
    );

    return shop ? this.toSummary(shop) : null;
  }

  async findByShopName(shopName: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { shopName },
      { populate: ['ownerUser'] }
    );

    return shop ? this.toSummary(shop) : null;
  }

  async findOwnedById(
    id: string,
    ownerUserId: string
  ): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      {
        id,
        ownerUser: ownerUserId,
      },
      { populate: ['ownerUser'] }
    );

    return shop ? this.toSummary(shop) : null;
  }

  private toSummary(shop: ShopEntity): ShopSummary {
    return {
      id: shop.id,
      publicId: shop.publicId,
      ownerUserId: shop.ownerUser.id,
      shopName: shop.shopName,
      status: shop.status,
    };
  }
}
