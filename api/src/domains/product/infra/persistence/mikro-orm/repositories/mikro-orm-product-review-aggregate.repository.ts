import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductReviewAggregateRepository } from '../../../../app/ports/product-review-aggregate.repository';
import { ProductReviewStatus } from '../../../../domain/enums/product-review-status.enum';

@Injectable()
export class MikroOrmProductReviewAggregateRepository
implements ProductReviewAggregateRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async recalculateForProduct(productId: string): Promise<void> {
    const entityManager = this.entityManager.fork();
    const rows = await entityManager.getConnection().execute<Array<{
      average_rating: string | number | null;
      review_count: string | number;
    }>>(
      `
        select
          round(coalesce(avg(rating), 0)::numeric, 1) as average_rating,
          count(*)::int as review_count
        from product_reviews
        where product_id = ?
          and status = ?
      `,
      [productId, ProductReviewStatus.PUBLISHED],
    );

    const averageRating = Number(rows[0]?.average_rating ?? 0);
    const reviewCount = Number(rows[0]?.review_count ?? 0);

    await entityManager.getConnection().execute(
      `
        update products
        set rating_average = ?, review_count = ?, updated_at = now()
        where id = ?
      `,
      [averageRating, reviewCount, productId],
    );
  }
}
