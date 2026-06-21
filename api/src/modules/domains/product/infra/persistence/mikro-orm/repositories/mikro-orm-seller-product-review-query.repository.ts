import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductReviewStatus } from '../../../../domain/enums/product-review-status.enum';
import { SellerProductReviewQueryRepository } from '../../../../app/ports/seller-product-review-query.repository';
import type {
  ListShopProductReviewsInput,
  ProductImageVariantSummary,
  ReviewImageSummary,
  ShopProductReviewItem,
  ShopProductReviewListResult,
} from '../../../../app/product.types';

type ReviewImageRow = {
  review_id: string;
  id: string;
  storage_key: string;
  size_bytes?: number | null;
  rank: number;
  variant_status?: string | null;
  variant_error?: string | null;
  variants_generated_at?: Date | string | null;
};

type ReviewImageVariantRow = {
  product_review_image_id: string;
  id: string;
  variant: string;
  storage_key: string;
  width?: number | null;
  height?: number | null;
  format?: string | null;
};

@Injectable()
export class MikroOrmSellerProductReviewQueryRepository
implements SellerProductReviewQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async listByShop(
    input: ListShopProductReviewsInput,
  ): Promise<ShopProductReviewListResult> {
    const connection = this.entityManager.fork().getConnection();
    const filters = ['pr.shop_id = ?'];
    const params: Array<string | number> = [input.shopId];

    if (input.status) {
      filters.push('pr.status = ?');
      params.push(input.status);
    }

    if (input.productId) {
      filters.push('pr.product_id = ?');
      params.push(input.productId);
    }

    const whereClause = filters.join(' and ');
    const orderBy = input.sort === 'oldest'
      ? 'pr.created_at asc'
      : input.sort === 'highest_rating'
        ? 'pr.rating desc, pr.created_at desc'
        : input.sort === 'lowest_rating'
          ? 'pr.rating asc, pr.created_at desc'
          : 'pr.created_at desc';

    const countFilters = ['pr.shop_id = ?'];
    const countParams: Array<string | number> = [input.shopId];

    if (input.productId) {
      countFilters.push('pr.product_id = ?');
      countParams.push(input.productId);
    }

    const counts = await connection.execute<Array<{
      status: ProductReviewStatus;
      count: string | number;
    }>>(
      `
        select pr.status, count(*)::int as count
        from product_reviews pr
        where ${countFilters.join(' and ')}
        group by pr.status
      `,
      countParams,
    );

    const totalRows = await connection.execute<Array<{ count: string | number }>>(
      `
        select count(*)::int as count
        from product_reviews pr
        where ${whereClause}
      `,
      params,
    );

    const total = Number(totalRows[0]?.count ?? 0);

    if (total === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
        counts: {
          all: counts.reduce((sum, row) => sum + Number(row.count), 0),
          published: Number(
            counts.find((row) => row.status === ProductReviewStatus.PUBLISHED)?.count ?? 0,
          ),
          hidden: Number(
            counts.find((row) => row.status === ProductReviewStatus.HIDDEN)?.count ?? 0,
          ),
        },
      };
    }

    const reviewRows = await connection.execute<Array<{
      id: string;
      order_id: string;
      order_item_id: string;
      rating: number;
      title: string | null;
      body: string | null;
      status: ProductReviewStatus;
      created_at: Date;
      updated_at: Date;
      user_id: string;
      display_name: string;
      email: string;
      product_id: string;
      product_title: string;
      product_slug: string;
    }>>(
      `
        select
          pr.id,
          pr.order_id,
          pr.order_item_id,
          pr.rating,
          pr.title,
          pr.body,
          pr.status,
          pr.created_at,
          pr.updated_at,
          u.id as user_id,
          coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1)) as display_name,
          u.email,
          p.id as product_id,
          p.title as product_title,
          p.slug as product_slug
        from product_reviews pr
        inner join users u on u.id = pr.user_id
        inner join products p on p.id = pr.product_id
        where ${whereClause}
        order by ${orderBy}
        limit ?
        offset ?
      `,
      [
        ...params,
        input.limit,
        (input.page - 1) * input.limit,
      ],
    );

    const reviewIds = reviewRows.map((row) => row.id);
    const imageRows = reviewIds.length > 0
      ? await connection.execute<ReviewImageRow[]>(
        `
          select review_id, id, storage_key, size_bytes, rank, variant_status, variant_error, variants_generated_at
          from product_review_images
          where review_id in (${reviewIds.map(() => '?').join(', ')})
          order by rank asc
        `,
        reviewIds,
      )
      : [];
    const variantsByImageId = await this.fetchReviewImageVariants(connection, imageRows.map((row) => row.id));
    const imagesByReviewId = new Map<string, ShopProductReviewItem['images']>();

    imageRows.forEach((row) => {
      const bucket = imagesByReviewId.get(row.review_id) ?? [];
      bucket.push(this.toReviewImageSummary(row, variantsByImageId.get(row.id) ?? []));
      imagesByReviewId.set(row.review_id, bucket);
    });

    return {
      items: reviewRows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        orderItemId: row.order_item_id,
        rating: Number(row.rating),
        title: row.title ?? undefined,
        body: row.body ?? undefined,
        status: row.status,
        images: imagesByReviewId.get(row.id) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        author: {
          id: row.user_id,
          displayName: row.display_name,
          email: row.email,
        },
        product: {
          id: row.product_id,
          title: row.product_title,
          slug: row.product_slug,
        },
      })),
      meta: buildPaginationMeta(input.page, input.limit, total),
      counts: {
        all: counts.reduce((sum, row) => sum + Number(row.count), 0),
        published: Number(
          counts.find((row) => row.status === ProductReviewStatus.PUBLISHED)?.count ?? 0,
        ),
        hidden: Number(
          counts.find((row) => row.status === ProductReviewStatus.HIDDEN)?.count ?? 0,
        ),
      },
    };
  }

  private async fetchReviewImageVariants(
    connection: ReturnType<EntityManager['getConnection']>,
    imageIds: string[],
  ): Promise<Map<string, ProductImageVariantSummary[]>> {
    if (imageIds.length === 0) {
      return new Map();
    }

    const variantRows = await connection.execute<ReviewImageVariantRow[]>(
      `
        select
          product_review_image_id,
          id,
          variant,
          storage_key,
          width,
          height,
          format
        from product_review_image_variants
        where product_review_image_id in (${imageIds.map(() => '?').join(', ')})
      `,
      imageIds,
    );

    const variantsByImageId = new Map<string, ProductImageVariantSummary[]>();

    variantRows.forEach((row) => {
      const bucket = variantsByImageId.get(row.product_review_image_id) ?? [];
      bucket.push({
        id: row.id,
        variant: row.variant,
        storageKey: row.storage_key,
        url: this.storageService.getPublicUrl(row.storage_key),
        width: row.width == null ? undefined : Number(row.width),
        height: row.height == null ? undefined : Number(row.height),
        format: row.format ?? undefined,
      });
      variantsByImageId.set(row.product_review_image_id, bucket);
    });

    return variantsByImageId;
  }

  private toReviewImageSummary(
    row: ReviewImageRow,
    variants: ProductImageVariantSummary[],
  ): ReviewImageSummary {
    return {
      id: row.id,
      storageKey: row.storage_key,
      url: this.storageService.getPublicUrl(row.storage_key),
      sizeBytes: row.size_bytes == null ? undefined : Number(row.size_bytes),
      rank: Number(row.rank),
      variantStatus: row.variant_status ?? undefined,
      variantError: row.variant_error ?? undefined,
      variantsGeneratedAt: row.variants_generated_at == null
        ? undefined
        : new Date(row.variants_generated_at),
      variants,
    };
  }
}
