import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import {
  ProductTranslationQueryRepository,
  type ProductTranslationValues,
} from '../../../../app/ports/product-translation-query.repository';
import { ProductTranslationEntity } from '../entities/product-translation.entity';

@Injectable()
export class MikroOrmProductTranslationQueryRepository
implements ProductTranslationQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findProductTranslations(
    productIds: readonly string[],
    language: StorefrontLanguage,
  ): Promise<Map<string, ProductTranslationValues>> {
    const uniqueProductIds = [...new Set(productIds)];

    if (uniqueProductIds.length === 0) {
      return new Map();
    }

    const translations = await this.entityManager
      .fork()
      .getRepository(ProductTranslationEntity)
      .find(
        { product: { id: { $in: uniqueProductIds } }, language },
        { fields: ['product', 'title', 'description'] },
      );

    return new Map(
      translations.map((translation) => [
        translation.product.id,
        {
          title: translation.title,
          description: translation.description,
        },
      ]),
    );
  }
}
