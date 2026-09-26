import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import {
  ProductShippingAssignmentPort,
} from '../../../app/ports/product-shipping-assignment.port';
import type {
  ProductShippingAssignment,
  ProductShippingShippability,
} from '../../../app/shipping.types';

/**
 * Narrow, deliberate cross-domain read: Shipping needs to know which Products
 * reference a profile so it can protect archived profiles and report assignment
 * counts. The dependency stays confined to this adapter and returns plain data,
 * so no Product entity reaches Shipping's application or domain code.
 */
@Injectable()
export class MikroOrmProductShippingAssignmentAdapter
implements ProductShippingAssignmentPort {
  constructor(private readonly entityManager: EntityManager) {}

  async listByProductIds(productIds: string[]): Promise<ProductShippingShippability[]> {
    if (productIds.length === 0) {
      return [];
    }

    const products = await this.entityManager
      .fork()
      .getRepository(ProductEntity)
      .find(
        { id: { $in: productIds } },
        { fields: ['id', 'state', 'isDigital', 'shippingProfile'] },
      );

    return products.map((product) => ({
      productId: product.id,
      shippingProfileId: product.shippingProfile?.id,
      productState: product.state,
      isDigital: product.isDigital,
    }));
  }

  async listByShippingProfileIds(
    shippingProfileIds: string[],
  ): Promise<ProductShippingAssignment[]> {
    if (shippingProfileIds.length === 0) {
      return [];
    }

    return this.loadAssignments({ shippingProfile: { $in: shippingProfileIds } });
  }

  private async loadAssignments(
    where: Record<string, unknown>,
  ): Promise<ProductShippingAssignment[]> {
    const products = await this.entityManager
      .fork()
      .getRepository(ProductEntity)
      .find(where, { fields: ['id', 'state', 'shippingProfile'] });

    return products
      .filter((product) => Boolean(product.shippingProfile))
      .map((product) => ({
        productId: product.id,
        shippingProfileId: product.shippingProfile!.id,
        productState: product.state,
      }));
  }
}
