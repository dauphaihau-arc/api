import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import { isShippingProfileCheckoutReady } from '../../../domain/shipping-profile-readiness';
import {
  ShippingProfileRepository,
  type ShippingProfileDefaultOutcome,
  type ShippingProfileTransitionOutcome,
} from '../../../app/ports/shipping-profile.repository';
import type {
  CreateShippingProfileRepositoryInput,
  ShippingProfileListRepositoryQuery,
  ShippingProfileListRepositoryResult,
  ShippingProfileStatusCounts,
  ShippingProfileSummary,
  UpdateShippingProfileRepositoryInput,
} from '../../../app/shipping.types';
import { ShippingProfileEntity } from '../entities/shipping-profile.entity';
import { ShippingProfileRateEntity } from '../entities/shipping-profile-rate.entity';

const profilePopulate = ['rates', 'shop'] as const;

@Injectable()
export class MikroOrmShippingProfileRepository implements ShippingProfileRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findById(
    shopId: string,
    shippingProfileId: string,
  ): Promise<ShippingProfileSummary | null> {
    const profile = await this.entityManager
      .fork()
      .getRepository(ShippingProfileEntity)
      .findOne(
        { id: shippingProfileId, shop: shopId },
        { populate: [...profilePopulate] },
      );

    return profile ? toShippingProfileSummary(profile) : null;
  }

  async findByIds(shippingProfileIds: string[]): Promise<ShippingProfileSummary[]> {
    if (shippingProfileIds.length === 0) {
      return [];
    }

    const profiles = await this.entityManager
      .fork()
      .getRepository(ShippingProfileEntity)
      .find(
        { id: { $in: shippingProfileIds } },
        { populate: [...profilePopulate], orderBy: { createdAt: 'ASC' } },
      );

    return profiles.map(toShippingProfileSummary);
  }

  async listByShop(
    shopId: string,
    query: ShippingProfileListRepositoryQuery,
  ): Promise<ShippingProfileListRepositoryResult> {
    const [profiles, total] = await this.entityManager
      .fork()
      .getRepository(ShippingProfileEntity)
      .findAndCount(
        { shop: shopId, status: { $in: query.statuses } },
        {
          populate: [...profilePopulate],
          orderBy: { createdAt: 'ASC' },
          offset: (query.page - 1) * query.limit,
          limit: query.limit,
        },
      );

    return {
      items: profiles.map(toShippingProfileSummary),
      total,
    };
  }

  async countByStatus(shopId: string): Promise<ShippingProfileStatusCounts> {
    const repository = this.entityManager.fork().getRepository(ShippingProfileEntity);
    const [active, draft, archived] = await Promise.all([
      repository.count({ shop: shopId, status: ShippingProfileStatus.ACTIVE }),
      repository.count({ shop: shopId, status: ShippingProfileStatus.DRAFT }),
      repository.count({ shop: shopId, status: ShippingProfileStatus.ARCHIVED }),
    ]);

    return { active, draft, archived };
  }

  async findByNormalizedName(
    shopId: string,
    normalizedName: string,
  ): Promise<ShippingProfileSummary | null> {
    const profile = await this.entityManager
      .fork()
      .getRepository(ShippingProfileEntity)
      .findOne(
        { shop: shopId, normalizedName },
        { populate: [...profilePopulate] },
      );

    return profile ? toShippingProfileSummary(profile) : null;
  }

  async create(
    input: CreateShippingProfileRepositoryInput,
  ): Promise<ShippingProfileSummary> {
    const entityManager = this.entityManager.fork();

    const profile = entityManager.create(ShippingProfileEntity, {
      shop: entityManager.getReference(ShopEntity, input.shopId),
      name: input.name,
      normalizedName: input.normalizedName,
      status: input.status,
      shipFromCountry: input.shipFromCountry,
      shipFromPostal: input.shipFromPostal,
      processingTimeMinDays: input.processingTimeMinDays,
      processingTimeMaxDays: input.processingTimeMaxDays,
    });

    const rates = input.rates.map((rate, index) => entityManager.create(ShippingProfileRateEntity, {
      shippingProfile: profile,
      position: index + 1,
      destinationScope: rate.destinationScope,
      destinationCountry: rate.destinationCountry,
      oneItemFeeMinor: rate.oneItemFeeMinor,
      additionalItemFeeMinor: rate.additionalItemFeeMinor,
      deliveryTimeMinDays: rate.deliveryTimeMinDays,
      deliveryTimeMaxDays: rate.deliveryTimeMaxDays,
    }));
    rates.forEach((rate) => profile.rates.add(rate));

    entityManager.persist(profile);
    entityManager.persist(rates);
    await entityManager.flush();

    // The created profile is returned with its resolved Shop currency.
    await entityManager.populate(profile, [...profilePopulate], { refresh: true });

    return toShippingProfileSummary(profile);
  }

  async update(
    input: UpdateShippingProfileRepositoryInput,
  ): Promise<ShippingProfileTransitionOutcome> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const profile = await this.lockProfile(entityManager, input);

      if (!profile) {
        return { status: 'version_conflict' };
      }

      // Evaluated under the profile row lock: a concurrent assignment waits for
      // this transaction, so the reference count cannot go stale between the
      // guard and the write.
      const nextIsCheckoutReady = isShippingProfileCheckoutReady(input);

      if (!nextIsCheckoutReady) {
        const publishedProductCount = await this.countPublishedProductReferences(
          entityManager,
          input.shippingProfileId,
        );

        if (publishedProductCount > 0) {
          return { status: 'published_products_reference', publishedProductCount };
        }
      }

      profile.name = input.name;
      profile.normalizedName = input.normalizedName;
      profile.status = input.status;
      profile.shipFromCountry = input.shipFromCountry;
      profile.shipFromPostal = input.shipFromPostal;
      profile.processingTimeMinDays = input.processingTimeMinDays;
      profile.processingTimeMaxDays = input.processingTimeMaxDays;

      // A profile that stops being able to price a checkout loses the shop-wide
      // default designation in the same transaction as the edit that removed it.
      if (!nextIsCheckoutReady) {
        profile.isDefault = false;
      }

      for (const rate of profile.rates.getItems()) {
        entityManager.remove(rate);
      }

      profile.rates.removeAll();

      const rates = input.rates.map((rate, index) => entityManager.create(ShippingProfileRateEntity, {
        shippingProfile: profile,
        position: index + 1,
        destinationScope: rate.destinationScope,
        destinationCountry: rate.destinationCountry ?? undefined,
        oneItemFeeMinor: rate.oneItemFeeMinor,
        additionalItemFeeMinor: rate.additionalItemFeeMinor,
        deliveryTimeMinDays: rate.deliveryTimeMinDays ?? undefined,
        deliveryTimeMaxDays: rate.deliveryTimeMaxDays ?? undefined,
      }));

      rates.forEach((rate) => profile.rates.add(rate));
      profile.version += 1;
      entityManager.persist(rates);
      await entityManager.flush();

      return { status: 'ok', profile: toShippingProfileSummary(profile) };
    });
  }

  async archive(input: {
    shopId: string;
    shippingProfileId: string;
    expectedVersion: number;
  }): Promise<ShippingProfileTransitionOutcome> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const profile = await this.lockProfile(entityManager, {
        shopId: input.shopId,
        shippingProfileId: input.shippingProfileId,
        expectedVersion: input.expectedVersion,
      });

      if (!profile) {
        return { status: 'version_conflict' };
      }

      // Inside the same transaction that holds the profile row lock, so an
      // assignment that is concurrently attaching this profile to a published
      // Product either already happened (and blocks the archive) or waits until
      // this transaction commits and then sees the archived status.
      const publishedProductCount = await this.countPublishedProductReferences(
        entityManager,
        input.shippingProfileId,
      );

      if (publishedProductCount > 0) {
        return { status: 'published_products_reference', publishedProductCount };
      }

      profile.status = ShippingProfileStatus.ARCHIVED;
      // An archived profile can never be the shop default, so archiving clears
      // the designation in the same transaction as the transition.
      profile.isDefault = false;
      profile.version += 1;
      await entityManager.flush();

      return { status: 'ok', profile: toShippingProfileSummary(profile) };
    });
  }

  async setDefault(input: {
    shopId: string;
    shippingProfileId: string;
    isDefault: boolean;
  }): Promise<ShippingProfileDefaultOutcome> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      // Serialize every designation change for the shop on its own profile rows,
      // so two concurrent sets cannot both observe "no default" and then both
      // write one. A deterministic order keeps two such transactions from
      // deadlocking on the same rows. The partial unique index stays the
      // backstop.
      await entityManager.execute(
        'select "id" from "shipping_profiles" where "shop_id" = ? order by "id" for update',
        [input.shopId],
      );

      const profile = await entityManager.getRepository(ShippingProfileEntity).findOne(
        {
          id: input.shippingProfileId,
          shop: input.shopId,
        },
        { populate: [...profilePopulate] },
      );

      if (!profile) {
        return { status: 'not_found' } as const;
      }

      const summary = toShippingProfileSummary(profile);

      if (input.isDefault && !isShippingProfileCheckoutReady(summary)) {
        return {
          status: 'not_eligible',
          reason: summary.status === ShippingProfileStatus.ARCHIVED ? 'archived' : 'not_checkout_ready',
        } as const;
      }

      // Only designating clears the current holder. Clearing a profile that is
      // not the default must leave the shop's designation untouched.
      if (input.isDefault) {
        await entityManager.nativeUpdate(
          ShippingProfileEntity,
          {
            shop: input.shopId,
            isDefault: true,
            id: { $ne: input.shippingProfileId },
          },
          { isDefault: false },
        );
      }

      profile.isDefault = input.isDefault;
      await entityManager.flush();

      return { status: 'ok', profile: toShippingProfileSummary(profile) } as const;
    });
  }

  /**
   * Locks the profile row for a lifecycle/configuration transition. Assignment
   * takes the same lock, so the two can never interleave between a guard and
   * its write.
   */
  private async lockProfile(
    entityManager: EntityManager,
    input: { shopId: string; shippingProfileId: string; expectedVersion: number },
  ): Promise<ShippingProfileEntity | null> {
    return entityManager.getRepository(ShippingProfileEntity).findOne(
      {
        id: input.shippingProfileId,
        shop: input.shopId,
        version: input.expectedVersion,
      },
      {
        populate: [...profilePopulate],
        lockMode: LockMode.PESSIMISTIC_WRITE,
      },
    );
  }

  /**
   * Narrow, deliberate cross-domain read inside the transition transaction:
   * only the count of published Products still referencing this profile is
   * needed, and no Product entity leaves this adapter.
   */
  private async countPublishedProductReferences(
    entityManager: EntityManager,
    shippingProfileId: string,
  ): Promise<number> {
    return entityManager.getRepository(ProductEntity).count({
      shippingProfile: shippingProfileId,
      state: ProductState.ACTIVE,
    });
  }
}

function toShippingProfileSummary(profile: ShippingProfileEntity): ShippingProfileSummary {
  return {
    id: profile.id,
    shopId: profile.shop.id,
    name: profile.name,
    status: profile.status,
    version: profile.version,
    isDefault: profile.isDefault,
    shopCurrency: profile.shop.currency,
    shipFromCountry: profile.shipFromCountry ?? undefined,
    shipFromPostal: profile.shipFromPostal ?? undefined,
    processingTimeMinDays: profile.processingTimeMinDays ?? undefined,
    processingTimeMaxDays: profile.processingTimeMaxDays ?? undefined,
    rates: profile.rates
      .getItems()
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((rate) => ({
        id: rate.id,
        position: rate.position,
        destinationScope: rate.destinationScope,
        destinationCountry: rate.destinationCountry ?? undefined,
        oneItemFeeMinor: rate.oneItemFeeMinor,
        additionalItemFeeMinor: rate.additionalItemFeeMinor,
        deliveryTimeMinDays: rate.deliveryTimeMinDays ?? undefined,
        deliveryTimeMaxDays: rate.deliveryTimeMaxDays ?? undefined,
      })),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
