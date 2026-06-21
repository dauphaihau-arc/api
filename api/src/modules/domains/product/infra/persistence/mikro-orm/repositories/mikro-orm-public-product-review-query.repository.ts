import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductReviewStatus } from '../../../../domain/enums/product-review-status.enum';
import { PublicProductReviewQueryRepository } from '../../../../app/ports/public-product-review-query.repository';
import type {
  ListPublicProductReviewImagesInput,
  ListPublicProductReviewsInput,
  ProductImageVariantSummary,
  PublicProductReviewImageListResult,
  PublicProductReviewListResult,
  PublicProductReviewSummary,
  ReviewImageSummary,
} from '../../../../app/product.types';
import { ProductState } from '../../../../domain/enums/product-state.enum';

type ReviewImageCursorPayload = {
  createdAt: string;
  reviewId: string;
  rank: number;
  imageId: string;
};

type SqlConnection = ReturnType<EntityManager['getConnection']>;

type ReviewImageRow = {
  review_id: string;
  id: string;
  storage_key: string;
  rank: number;
  size_bytes?: number | null;
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
export class MikroOrmPublicProductReviewQueryRepository
implements PublicProductReviewQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async listPublicByProductSlug(
    input: ListPublicProductReviewsInput,
  ): Promise<PublicProductReviewListResult | null> {
    const connection = this.entityManager.fork().getConnection();
    const product = await this.findActiveProduct(connection, input.shopSlug, input.productSlug);

    if (!product) {
      return null;
    }

    const breakdownRows = await connection.execute<Array<{
      rating: number;
      count: string | number;
    }>>(
      `
        select rating, count(*)::int as count
        from product_reviews
        where product_id = ?
          and status = ?
        group by rating
      `,
      [product.product_id, ProductReviewStatus.PUBLISHED],
    );

    const summary: PublicProductReviewSummary = {
      average: Number(product.rating_average ?? 0),
      count: Number(product.review_count ?? 0),
      breakdown: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      },
      filters: {
        hasImages: 0,
        hasComment: 0,
      },
    };

    breakdownRows.forEach((row) => {
      const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      if (rating >= 1 && rating <= 5) {
        summary.breakdown[rating] = Number(row.count);
      }
    });

    const [hasImagesRow, hasCommentRow] = await Promise.all([
      connection.execute<Array<{ count: string | number }>>(
        `
          select count(distinct pr.id)::int as count
          from product_reviews pr
          where pr.product_id = ?
            and pr.status = ?
            and exists (
              select 1
              from product_review_images pri
              where pri.review_id = pr.id
            )
        `,
        [product.product_id, ProductReviewStatus.PUBLISHED],
      ),
      connection.execute<Array<{ count: string | number }>>(
        `
          select count(*)::int as count
          from product_reviews pr
          where pr.product_id = ?
            and pr.status = ?
            and (
              nullif(trim(coalesce(pr.title, '')), '') is not null
              or nullif(trim(coalesce(pr.body, '')), '') is not null
            )
        `,
        [product.product_id, ProductReviewStatus.PUBLISHED],
      ),
    ]);

    summary.filters = {
      hasImages: Number(hasImagesRow[0]?.count ?? 0),
      hasComment: Number(hasCommentRow[0]?.count ?? 0),
    };

    if (summary.count === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
        summary,
      };
    }

    const orderBy = input.sort === 'highest_rating'
      ? 'pr.rating desc, pr.created_at desc'
      : input.sort === 'lowest_rating'
        ? 'pr.rating asc, pr.created_at desc'
        : 'pr.created_at desc';

    const filterClauses = ['pr.product_id = ?', 'pr.status = ?'];
    const filterParams: Array<string | number> = [
      product.product_id,
      ProductReviewStatus.PUBLISHED,
    ];

    if (input.rating) {
      filterClauses.push('pr.rating = ?');
      filterParams.push(input.rating);
    }

    if (input.hasImages) {
      filterClauses.push(`
        exists (
          select 1
          from product_review_images pri
          where pri.review_id = pr.id
        )
      `);
    }

    if (input.hasComment) {
      filterClauses.push(`
        (
          nullif(trim(coalesce(pr.title, '')), '') is not null
          or nullif(trim(coalesce(pr.body, '')), '') is not null
        )
      `);
    }

    const whereClause = filterClauses.join('\n          and ');
    const totalRows = await connection.execute<Array<{ count: string | number }>>(
      `
        select count(*)::int as count
        from product_reviews pr
        where ${whereClause}
      `,
      filterParams,
    );
    const filteredCount = Number(totalRows[0]?.count ?? 0);

    if (filteredCount === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
        summary,
      };
    }

    const reviewRows = await connection.execute<Array<{
      id: string;
      rating: number;
      title: string | null;
      body: string | null;
      created_at: Date | string;
      updated_at: Date | string;
      display_name: string;
    }>>(
      `
        select
          pr.id,
          pr.rating,
          pr.title,
          pr.body,
          pr.created_at,
          pr.updated_at,
          coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1)) as display_name
        from product_reviews pr
        inner join users u on u.id = pr.user_id
        where ${whereClause}
        order by ${orderBy}
        limit ?
        offset ?
      `,
      [
        ...filterParams,
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
    const imagesByReviewId = new Map<string, ReviewImageSummary[]>();

    imageRows.forEach((row) => {
      const bucket = imagesByReviewId.get(row.review_id) ?? [];
      bucket.push(this.toReviewImageSummary(row, variantsByImageId.get(row.id) ?? []));
      imagesByReviewId.set(row.review_id, bucket);
    });

    const rows = reviewRows as Array<{
      id: string;
      rating: number;
      title: string | null;
      body: string | null;
      created_at: Date | string;
      updated_at: Date | string;
      display_name: string;
    }>;

    const items = new Map<string, PublicProductReviewListResult['items'][number]>();

    rows.forEach((row) => {
      const existing = items.get(row.id) ?? {
        id: row.id,
        rating: Number(row.rating),
        title: row.title ?? undefined,
        body: row.body ?? undefined,
        images: [],
        createdAt: this.toDate(row.created_at, 'review created_at'),
        updatedAt: this.toDate(row.updated_at, 'review updated_at'),
        verifiedPurchase: true,
        author: {
          displayName: row.display_name,
        },
      };

      existing.images = imagesByReviewId.get(row.id) ?? [];

      items.set(row.id, existing);
    });

    return {
      items: Array.from(items.values()),
      meta: buildPaginationMeta(input.page, input.limit, filteredCount),
      summary,
    };
  }

  async listPublicImagesByProductSlug(
    input: ListPublicProductReviewImagesInput,
  ): Promise<PublicProductReviewImageListResult | null> {
    const connection = this.entityManager.fork().getConnection();
    const product = await this.findActiveProduct(connection, input.shopSlug, input.productSlug);

    if (!product) {
      return null;
    }

    const cursor = input.cursor ? this.decodeReviewImageCursor(input.cursor) : null;
    const cursorClause = cursor
      ? `
          and (
            pr.created_at < ?
            or (pr.created_at = ? and pri.review_id < ?)
            or (pr.created_at = ? and pri.review_id = ? and pri.rank > ?)
            or (pr.created_at = ? and pri.review_id = ? and pri.rank = ? and pri.id > ?)
          )
        `
      : '';

    const params: Array<string | number | Date> = [
      product.product_id,
      ProductReviewStatus.PUBLISHED,
    ];

    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      params.push(
        createdAt,
        createdAt,
        cursor.reviewId,
        createdAt,
        cursor.reviewId,
        cursor.rank,
        createdAt,
        cursor.reviewId,
        cursor.rank,
        cursor.imageId,
      );
    }

    params.push(input.limit + 1);

    const imageRows = await connection.execute<Array<{
      id: string;
      review_id: string;
      review_title: string | null;
      storage_key: string;
      size_bytes?: number | null;
      rank: number;
      variant_status?: string | null;
      variant_error?: string | null;
      variants_generated_at?: Date | string | null;
      created_at: Date | string;
      display_name: string;
    }>>(
      `
        select
          pri.id,
          pri.review_id,
          pr.title as review_title,
          pri.storage_key,
          pri.size_bytes,
          pri.rank,
          pri.variant_status,
          pri.variant_error,
          pri.variants_generated_at,
          pr.created_at,
          coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1)) as display_name
        from product_review_images pri
        inner join product_reviews pr on pr.id = pri.review_id
        inner join users u on u.id = pr.user_id
        where pr.product_id = ?
          and pr.status = ?
          ${cursorClause}
        order by pr.created_at desc, pri.review_id desc, pri.rank asc, pri.id asc
        limit ?
      `,
      params,
    );

    const hasMore = imageRows.length > input.limit;
    const pageRows = imageRows.slice(0, input.limit);
    const variantsByImageId = await this.fetchReviewImageVariants(connection, pageRows.map((row) => row.id));
    const items = pageRows.map((row) => ({
      ...this.toReviewImageSummary(row, variantsByImageId.get(row.id) ?? []),
      reviewId: row.review_id,
      reviewTitle: row.review_title ?? undefined,
      createdAt: this.toDate(row.created_at, 'review image created_at'),
      author: {
        displayName: row.display_name,
      },
    }));
    const lastItem = items[items.length - 1];

    return {
      items,
      meta: {
        nextCursor: hasMore && lastItem
          ? this.encodeReviewImageCursor({
            createdAt: lastItem.createdAt.toISOString(),
            reviewId: lastItem.reviewId,
            rank: lastItem.rank,
            imageId: lastItem.id,
          })
          : undefined,
        hasMore,
      },
    };
  }

  private async findActiveProduct(
    connection: SqlConnection,
    shopSlug: string,
    productSlug: string,
  ): Promise<{
    product_id: string;
    rating_average: string | number;
    review_count: string | number;
  } | null> {
    const products = await connection.execute<Array<{
      product_id: string;
      rating_average: string | number;
      review_count: string | number;
    }>>(
      `
        select
          p.id as product_id,
          p.rating_average,
          p.review_count
        from products p
        inner join shops s on s.id = p.shop_id
        where s.slug = ?
          and p.slug = ?
          and p.state = ?
        limit 1
      `,
      [shopSlug, productSlug, ProductState.ACTIVE],
    );

    return products[0] ?? null;
  }

  private encodeReviewImageCursor(payload: ReviewImageCursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private async fetchReviewImageVariants(
    connection: SqlConnection,
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
      variantsGeneratedAt: row.variants_generated_at
        ? this.toDate(row.variants_generated_at, 'review image variants_generated_at')
        : undefined,
      variants,
    };
  }

  private toDate(value: Date | string, fieldName: string): Date {
    if (value instanceof Date) {
      return value;
    }
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }
    return parsed;
  }

  private decodeReviewImageCursor(cursor: string): ReviewImageCursorPayload {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ReviewImageCursorPayload>;

      if (
        typeof parsed.createdAt !== 'string'
        || Number.isNaN(new Date(parsed.createdAt).getTime())
        || typeof parsed.reviewId !== 'string'
        || typeof parsed.imageId !== 'string'
        || typeof parsed.rank !== 'number'
        || Number.isNaN(parsed.rank)
      ) {
        throw new Error('Invalid cursor shape');
      }

      return {
        createdAt: parsed.createdAt,
        reviewId: parsed.reviewId,
        rank: parsed.rank,
        imageId: parsed.imageId,
      };
    }
    catch {
      throw new BadRequestException('Invalid review image cursor');
    }
  }
}
