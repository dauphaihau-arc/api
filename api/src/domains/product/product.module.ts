import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { IdempotencyModule } from '~/platform/idempotency/idempotency.module';
import { CacheModule } from '~/integrations/cache/cache.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { AuditModule } from '~/integrations/audit/audit.module';
import { AiModule } from '~/integrations/ai/ai.module';
import { ImageTransformModule } from '~/integrations/image-transform/image-transform.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { SseModule } from '~/platform/sse/sse.module';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ShopModule } from '../shop/shop.module';
import { ProductImageService } from './app/services/product-image.service';
import { ReviewImageService } from './app/services/review-image.service';
import { PendingReviewImageUploadService } from './app/pending-review-image-upload.service';
import { ResolvedStorefrontPriceService } from './app/services/resolved-storefront-price.service';
import { StorefrontMarketContextService } from './app/services/storefront-market-context.service';
import { CatalogStatusService } from './app/services/catalog-status.service';
import { CatalogProductProjectorService } from './app/services/catalog-product-projector.service';
import { StorefrontIndexedPriceProjectionService } from './app/services/storefront-indexed-price-projection.service';
import { PublicProductOrderHistoryService } from './app/services/public-product-order-history.service';
import { PublicProductBestSellerRankingService } from './app/services/public-product-best-seller-ranking.service';
import { CreateProductDraftFacadeUseCase } from './app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import { ConsumeProductImageUploadTicketUseCase } from './app/use-cases/consume-product-image-upload-ticket/consume-product-image-upload-ticket.use-case';
import { CreateProductDraftUseCase } from './app/use-cases/create-product-draft/create-product-draft.use-case';
import { GetProductByIdUseCase } from './app/use-cases/get-product-by-id/get-product-by-id.use-case';
import { GetPublicProductBySlugsUseCase } from './app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { GetPublicProductRecommendationSectionsUseCase } from './app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import { IssueProductImageUploadUrlUseCase } from './app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { IssueReviewImageUploadUrlUseCase } from './app/use-cases/issue-review-image-upload-url/issue-review-image-upload-url.use-case';
import { ListPublicProductReviewImagesUseCase } from './app/use-cases/list-public-product-review-images/list-public-product-review-images.use-case';
import { ListPublicProductReviewsUseCase } from './app/use-cases/list-public-product-reviews/list-public-product-reviews.use-case';
import { ListPublicProductsUseCase } from './app/use-cases/list-public-products/list-public-products.use-case';
import { ListShopProductReviewsUseCase } from './app/use-cases/list-shop-product-reviews/list-shop-product-reviews.use-case';
import { ListShopProductsUseCase } from './app/use-cases/list-shop-products/list-shop-products.use-case';
import { RecommendPublicProductsUseCase } from './app/use-cases/recommend-public-products/recommend-public-products.use-case';
import { SuggestPublicProductsUseCase } from './app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { GenerateProductDescriptionUseCase } from './app/use-cases/generate-product-description/generate-product-description.use-case';
import { PublicProductViewHistoryService } from './app/services/public-product-view-history.service';
import { BulkMutateShopProductsUseCase } from './app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case';
import { ConsumeReviewImageUploadTicketUseCase } from './app/use-cases/consume-review-image-upload-ticket/consume-review-image-upload-ticket.use-case';
import { PublishProductUseCase } from './app/use-cases/publish-product/publish-product.use-case';
import { SetProductImagesByKeysUseCase } from './app/use-cases/set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductImagesUseCase } from './app/use-cases/set-product-images/set-product-images.use-case';
import { SetProductAttributesUseCase } from './app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { SetProductInventoryUseCase } from './app/use-cases/set-product-inventory/set-product-inventory.use-case';
import { SetProductPricingUseCase } from './app/use-cases/set-product-pricing/set-product-pricing.use-case';
import { SetProductShippingUseCase } from './app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from './app/use-cases/set-product-variants/set-product-variants.use-case';
import { UpsertMyProductReviewUseCase } from './app/use-cases/upsert-my-product-review/upsert-my-product-review.use-case';
import { UpdateProductDetailsUseCase } from './app/use-cases/update-product-details/update-product-details.use-case';
import { ProductCommandRepository } from './app/ports/product-command.repository';
import { ProductPricingRepository } from './app/ports/product-pricing.repository';
import { ProductImageVariantGenerationRepository } from './app/ports/product-image-variant-generation.repository';
import { ReviewImageVariantGenerationRepository } from './app/ports/review-image-variant-generation.repository';
import { PublicProductReviewQueryRepository } from './app/ports/public-product-review-query.repository';
import { SellerProductReviewQueryRepository } from './app/ports/seller-product-review-query.repository';
import { CatalogProductDocumentRepository } from './app/ports/catalog-product-document.repository';
import { CatalogProductPriceDocumentRepository } from './app/ports/catalog-product-price-document.repository';
import { CatalogProductProjectorSourceRepository } from './app/ports/catalog-product-projector-source.repository';
import { CatalogSearchDocumentRepository } from './app/ports/catalog-search-document.repository';
import { CatalogProductSlugRepository } from './app/ports/catalog-product-slug.repository';
import { ProductRecommendationQueryRepository } from './app/ports/product-recommendation-query.repository';
import { ProductReviewAggregateRepository } from './app/ports/product-review-aggregate.repository';
import { PublicProductOrderHistoryRepository } from './app/ports/public-product-order-history.repository';
import { PublicProductViewHistoryRepository } from './app/ports/public-product-view-history.repository';
import { SellerProductQueryRepository } from './app/ports/seller-product-query.repository';
import { StorefrontProductQueryRepository } from './app/ports/storefront-product-query.repository';
import { InternalCatalogController } from './api/rest/internal/internal-catalog.controller';
import { ProductActivityController } from './api/rest/activity/product-activity.controller';
import { ProductController } from './api/rest/storefront/product.controller';
import { ProductRecommendationController } from './api/rest/recommendations/product-recommendation.controller';
import { ProductActivitySessionService } from './api/rest/activity/product-activity-session.service';
import { ProductInventoryEventsController } from './api/rest/inventory-events/product-inventory-events.controller';
import { MeProductReviewController } from './api/rest/me/me-product-review.controller';
import { ReviewImageUploadController } from './api/rest/me/review-image-upload.controller';
import { ProductUploadController } from './api/rest/uploads/product-upload.controller';
import { ForwardProductInventoryUpdatedToSseListener } from './listeners/forward-product-inventory-updated-to-sse.listener';
import { ShopProductsController } from '../shop/api/rest/shop-products.controller';
import { ShopProductReviewsController } from '../shop/api/rest/shop-product-reviews.controller';
import { AtlasProductRecommendationQueryRepository } from './infra/search/atlas/repositories/atlas-product-recommendation-query.repository';
import { MikroOrmProductCommandRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-command.repository';
import { MikroOrmCatalogProductProjectorSourceRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-catalog-product-projector-source.repository';
import { MikroOrmProductImageVariantGenerationRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-image-variant-generation.repository';
import { MikroOrmReviewImageVariantGenerationRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-review-image-variant-generation.repository';
import { MikroOrmPublicProductOrderHistoryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-public-product-order-history.repository';
import { MikroOrmPublicProductReviewQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-public-product-review-query.repository';
import { MikroOrmSellerProductReviewQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-seller-product-review-query.repository';
import { MikroOrmPublicProductViewHistoryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-public-product-view-history.repository';
import { MikroOrmProductRecommendationQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-recommendation-query.repository';
import { MikroOrmProductReviewAggregateRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-review-aggregate.repository';
import { MikroOrmSellerProductQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-seller-product-query.repository';
import { MikroOrmStorefrontProductQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository';
import { MongoCatalogProductDocumentRepository } from './infra/catalog/mongo/repositories/mongo-catalog-product-document.repository';
import { MongoCatalogProductPriceDocumentRepository } from './infra/catalog/mongo/repositories/mongo-catalog-product-price-document.repository';
import { MongoCatalogSearchDocumentRepository } from './infra/catalog/mongo/repositories/mongo-catalog-search-document.repository';
import { MongoCatalogProductSlugRepository } from './infra/catalog/mongo/repositories/mongo-catalog-product-slug.repository';
import { AtlasSearchStorefrontProductQueryRepository } from './infra/search/atlas/repositories/atlas-search-storefront-product-query.repository';
import { CatalogMongoAccess } from './infra/catalog/mongo/access/catalog-mongo.access';
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image-variant.entity';
import { ProductInventoryReservationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductReviewEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review.entity';
import { ProductReviewImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image.entity';
import { ProductReviewImageVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review-image-variant.entity';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductViewHistoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-view-history.entity';
import { ProductBestSellerRankingEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-best-seller-ranking.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { CATALOG_CONFIG, buildCatalogConfig } from '~/platform/config/catalog.config';
import { STOREFRONT_PRICING_CONFIG, buildStorefrontPricingConfig } from '~/platform/config/storefront-pricing.config';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    IdempotencyModule,
    forwardRef(() => AuthModule),
    ShopModule,
    CategoryModule,
    StorageModule,
    AiModule,
    ImageTransformModule,
    CurrencyModule,
    forwardRef(() => QueueModule),
    AuditModule,
    SseModule,
    MikroOrmModule.forFeature([
      ProductEntity,
      ProductImageEntity,
      ProductImageVariantEntity,
      ProductAttributeValueEntity,
      ProductVariantEntity,
      ProductViewHistoryEntity,
      ProductBestSellerRankingEntity,
      ProductInventoryEntity,
      ProductReviewEntity,
      ProductReviewImageEntity,
      ProductReviewImageVariantEntity,
      VariantPriceEntity,
      ProductInventoryReservationEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
    ]),
  ],
  controllers: [
    InternalCatalogController,
    ProductActivityController,
    ProductController,
    ProductRecommendationController,
    ProductInventoryEventsController,
    MeProductReviewController,
    ReviewImageUploadController,
    ProductUploadController,
    ShopProductsController,
    ShopProductReviewsController,
  ],
  providers: [
    {
      provide: CATALOG_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildCatalogConfig(configService),
    },
    {
      provide: STOREFRONT_PRICING_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildStorefrontPricingConfig(configService),
    },
    {
      provide: StorefrontProductQueryRepository,
      inject: [
        CATALOG_CONFIG,
        AtlasSearchStorefrontProductQueryRepository,
        MikroOrmStorefrontProductQueryRepository,
      ],
      useFactory: (
        catalogConfig: ReturnType<typeof buildCatalogConfig>,
        atlasSearchStorefrontProductQueryRepository: AtlasSearchStorefrontProductQueryRepository,
        mikroOrmStorefrontProductQueryRepository: MikroOrmStorefrontProductQueryRepository,
      ) =>
        catalogConfig.driver === 'mongodb'
          ? atlasSearchStorefrontProductQueryRepository
          : mikroOrmStorefrontProductQueryRepository,
    },
    {
      provide: ProductRecommendationQueryRepository,
      inject: [
        CATALOG_CONFIG,
        AtlasProductRecommendationQueryRepository,
        MikroOrmProductRecommendationQueryRepository,
      ],
      useFactory: (
        catalogConfig: ReturnType<typeof buildCatalogConfig>,
        atlasProductRecommendationQueryRepository: AtlasProductRecommendationQueryRepository,
        mikroOrmProductRecommendationQueryRepository: MikroOrmProductRecommendationQueryRepository,
      ) =>
        catalogConfig.driver === 'mongodb'
          ? atlasProductRecommendationQueryRepository
          : mikroOrmProductRecommendationQueryRepository,
    },
    {
      provide: SellerProductQueryRepository,
      useExisting: MikroOrmSellerProductQueryRepository,
    },
    {
      provide: PublicProductOrderHistoryRepository,
      useExisting: MikroOrmPublicProductOrderHistoryRepository,
    },
    {
      provide: PublicProductViewHistoryRepository,
      useExisting: MikroOrmPublicProductViewHistoryRepository,
    },
    {
      provide: SellerProductReviewQueryRepository,
      useExisting: MikroOrmSellerProductReviewQueryRepository,
    },
    {
      provide: PublicProductReviewQueryRepository,
      useExisting: MikroOrmPublicProductReviewQueryRepository,
    },
    {
      provide: CatalogProductDocumentRepository,
      useExisting: MongoCatalogProductDocumentRepository,
    },
    {
      provide: CatalogProductPriceDocumentRepository,
      useExisting: MongoCatalogProductPriceDocumentRepository,
    },
    {
      provide: CatalogProductProjectorSourceRepository,
      useExisting: MikroOrmCatalogProductProjectorSourceRepository,
    },
    {
      provide: CatalogProductSlugRepository,
      useExisting: MongoCatalogProductSlugRepository,
    },
    {
      provide: CatalogSearchDocumentRepository,
      useExisting: MongoCatalogSearchDocumentRepository,
    },
    {
      provide: ProductCommandRepository,
      useExisting: MikroOrmProductCommandRepository,
    },
    {
      provide: ProductPricingRepository,
      useExisting: MikroOrmProductCommandRepository,
    },
    {
      provide: ProductImageVariantGenerationRepository,
      useExisting: MikroOrmProductImageVariantGenerationRepository,
    },
    {
      provide: ReviewImageVariantGenerationRepository,
      useExisting: MikroOrmReviewImageVariantGenerationRepository,
    },
    {
      provide: ProductReviewAggregateRepository,
      useExisting: MikroOrmProductReviewAggregateRepository,
    },
    AtlasProductRecommendationQueryRepository,
    ProductImageService,
    ReviewImageService,
    CatalogMongoAccess,
    AtlasSearchStorefrontProductQueryRepository,
    MongoCatalogProductDocumentRepository,
    MongoCatalogProductPriceDocumentRepository,
    MongoCatalogSearchDocumentRepository,
    MongoCatalogProductSlugRepository,
    MikroOrmCatalogProductProjectorSourceRepository,
    MikroOrmProductCommandRepository,
    MikroOrmProductImageVariantGenerationRepository,
    MikroOrmReviewImageVariantGenerationRepository,
    MikroOrmPublicProductOrderHistoryRepository,
    MikroOrmPublicProductReviewQueryRepository,
    MikroOrmPublicProductViewHistoryRepository,
    MikroOrmProductRecommendationQueryRepository,
    MikroOrmProductReviewAggregateRepository,
    MikroOrmSellerProductReviewQueryRepository,
    MikroOrmSellerProductQueryRepository,
    MikroOrmStorefrontProductQueryRepository,

    CatalogStatusService,
    CatalogProductProjectorService,
    StorefrontMarketContextService,
    StorefrontIndexedPriceProjectionService,
    ResolvedStorefrontPriceService,
    PublicProductOrderHistoryService,
    PublicProductBestSellerRankingService,
    PublicProductViewHistoryService,
    ProductActivitySessionService,
    PendingReviewImageUploadService,

    ConsumeProductImageUploadTicketUseCase,
    ConsumeReviewImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    GetPublicProductRecommendationSectionsUseCase,
    GenerateProductDescriptionUseCase,
    IssueProductImageUploadUrlUseCase,
    IssueReviewImageUploadUrlUseCase,
    ListPublicProductReviewImagesUseCase,
    ListPublicProductReviewsUseCase,
    ListPublicProductsUseCase,
    ListShopProductReviewsUseCase,
    ListShopProductsUseCase,
    RecommendPublicProductsUseCase,
    SuggestPublicProductsUseCase,
    BulkMutateShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesByKeysUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductPricingUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpsertMyProductReviewUseCase,
    UpdateProductDetailsUseCase,
    ForwardProductInventoryUpdatedToSseListener,
  ],
  exports: [
    CATALOG_CONFIG,
    ProductRecommendationQueryRepository,
    StorefrontProductQueryRepository,
    SellerProductQueryRepository,
    CatalogProductDocumentRepository,
    CatalogProductPriceDocumentRepository,
    CatalogSearchDocumentRepository,
    CatalogProductSlugRepository,
    ProductCommandRepository,
    ProductPricingRepository,

    ProductImageService,
    ReviewImageService,
    CatalogProductProjectorService,
    StorefrontMarketContextService,
    ResolvedStorefrontPriceService,
    PublicProductOrderHistoryService,
    PublicProductBestSellerRankingService,
    PendingReviewImageUploadService,

    ConsumeProductImageUploadTicketUseCase,
    ConsumeReviewImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    GetPublicProductRecommendationSectionsUseCase,
    IssueProductImageUploadUrlUseCase,
    IssueReviewImageUploadUrlUseCase,
    ListPublicProductReviewImagesUseCase,
    ListPublicProductReviewsUseCase,
    ListPublicProductsUseCase,
    ListShopProductReviewsUseCase,
    ListShopProductsUseCase,
    RecommendPublicProductsUseCase,
    SuggestPublicProductsUseCase,
    BulkMutateShopProductsUseCase,
    PublishProductUseCase,
    SetProductImagesByKeysUseCase,
    SetProductImagesUseCase,
    SetProductAttributesUseCase,
    SetProductInventoryUseCase,
    SetProductPricingUseCase,
    SetProductShippingUseCase,
    SetProductVariantsUseCase,
    UpsertMyProductReviewUseCase,
    UpdateProductDetailsUseCase,
  ],
})
export class ProductModule {}
