import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { ImageTransformModule } from '../../shared/image-transform/image-transform.module';
import { CurrencyModule } from '../../shared/currency/currency.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { SseModule } from '../../shared/sse/sse.module';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ShopModule } from '../shop/shop.module';
import { ProductImageService } from './app/services/product-image.service';
import { ResolvedStorefrontPriceService } from './app/services/resolved-storefront-price.service';
import { StorefrontMarketContextService } from './app/services/storefront-market-context.service';
import { CatalogStatusService } from './app/services/catalog-status.service';
import { CatalogProductProjectorService } from './app/services/catalog-product-projector.service';
import { PublicProductOrderHistoryService } from './app/services/public-product-order-history.service';
import { CreateProductDraftFacadeUseCase } from './app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';
import { ConsumeProductImageUploadTicketUseCase } from './app/use-cases/consume-product-image-upload-ticket/consume-product-image-upload-ticket.use-case';
import { CreateProductDraftUseCase } from './app/use-cases/create-product-draft/create-product-draft.use-case';
import { GetProductByIdUseCase } from './app/use-cases/get-product-by-id/get-product-by-id.use-case';
import { GetPublicProductBySlugsUseCase } from './app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { GetPublicProductRecommendationSectionsUseCase } from './app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import { IssueProductImageUploadUrlUseCase } from './app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { ListPublicProductsUseCase } from './app/use-cases/list-public-products/list-public-products.use-case';
import { ListShopProductsUseCase } from './app/use-cases/list-shop-products/list-shop-products.use-case';
import { RecommendPublicProductsUseCase } from './app/use-cases/recommend-public-products/recommend-public-products.use-case';
import { SuggestPublicProductsUseCase } from './app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { PublicProductViewHistoryService } from './app/services/public-product-view-history.service';
import { BulkMutateShopProductsUseCase } from './app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case';
import { PublishProductUseCase } from './app/use-cases/publish-product/publish-product.use-case';
import { SetProductImagesByKeysUseCase } from './app/use-cases/set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductImagesUseCase } from './app/use-cases/set-product-images/set-product-images.use-case';
import { SetProductAttributesUseCase } from './app/use-cases/set-product-attributes/set-product-attributes.use-case';
import { SetProductInventoryUseCase } from './app/use-cases/set-product-inventory/set-product-inventory.use-case';
import { SetProductPricingUseCase } from './app/use-cases/set-product-pricing/set-product-pricing.use-case';
import { SetProductShippingUseCase } from './app/use-cases/set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from './app/use-cases/set-product-variants/set-product-variants.use-case';
import { UpdateProductDetailsUseCase } from './app/use-cases/update-product-details/update-product-details.use-case';
import { ProductCommandRepository } from './app/ports/product-command.repository';
import { ProductPricingRepository } from './app/ports/product-pricing.repository';
import { CatalogProductDocumentRepository } from './app/ports/catalog-product-document.repository';
import { CatalogSearchDocumentRepository } from './app/ports/catalog-search-document.repository';
import { CatalogProductSlugRepository } from './app/ports/catalog-product-slug.repository';
import { ProductRecommendationQueryRepository } from './app/ports/product-recommendation-query.repository';
import { SellerProductQueryRepository } from './app/ports/seller-product-query.repository';
import { StorefrontProductQueryRepository } from './app/ports/storefront-product-query.repository';
import { InternalCatalogController } from './api/rest/internal/internal-catalog.controller';
import { ProductActivityController } from './api/rest/activity/product-activity.controller';
import { ProductController } from './api/rest/storefront/product.controller';
import { ProductRecommendationController } from './api/rest/recommendations/product-recommendation.controller';
import { ProductActivitySessionService } from './api/rest/activity/product-activity-session.service';
import { ProductInventoryEventsController } from './api/rest/inventory-events/product-inventory-events.controller';
import { ProductUploadController } from './api/rest/uploads/product-upload.controller';
import { ForwardProductInventoryUpdatedToSseListener } from './listeners/forward-product-inventory-updated-to-sse.listener';
import { ShopProductsController } from '../shop/api/rest/shop-products.controller';
import { AtlasProductRecommendationQueryRepository } from './infra/search/atlas/repositories/atlas-product-recommendation-query.repository';
import { MikroOrmProductCommandRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-command.repository';
import { MikroOrmProductRecommendationQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-product-recommendation-query.repository';
import { MikroOrmSellerProductQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-seller-product-query.repository';
import { MikroOrmStorefrontProductQueryRepository } from './infra/persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository';
import { MongoCatalogProductDocumentRepository } from './infra/catalog/mongo/repositories/mongo-catalog-product-document.repository';
import { MongoCatalogSearchDocumentRepository } from './infra/catalog/mongo/repositories/mongo-catalog-search-document.repository';
import { MongoCatalogProductSlugRepository } from './infra/catalog/mongo/repositories/mongo-catalog-product-slug.repository';
import { AtlasSearchStorefrontProductQueryRepository } from './infra/search/atlas/repositories/atlas-search-storefront-product-query.repository';
import { CatalogMongoAccess } from './infra/catalog/mongo/access/catalog-mongo.access';
import { ProductAttributeValueEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductImageVariantEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-image-variant.entity';
import { ProductInventoryReservationEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ProductViewHistoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-view-history.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { VariantPriceEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { CATALOG_CONFIG, buildCatalogConfig } from '~/config/catalog.config';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    IdempotencyModule,
    forwardRef(() => AuthModule),
    ShopModule,
    CategoryModule,
    StorageModule,
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
      ProductInventoryEntity,
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
    ProductUploadController,
    ShopProductsController,
  ],
  providers: [
    {
      provide: CATALOG_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildCatalogConfig(configService),
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
        mikroOrmStorefrontProductQueryRepository: MikroOrmStorefrontProductQueryRepository
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
        mikroOrmProductRecommendationQueryRepository: MikroOrmProductRecommendationQueryRepository
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
      provide: CatalogProductDocumentRepository,
      useExisting: MongoCatalogProductDocumentRepository,
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
    AtlasProductRecommendationQueryRepository,
    ProductImageService,
    CatalogMongoAccess,
    AtlasSearchStorefrontProductQueryRepository,
    MongoCatalogProductDocumentRepository,
    MongoCatalogSearchDocumentRepository,
    MongoCatalogProductSlugRepository,
    MikroOrmProductCommandRepository,
    MikroOrmProductRecommendationQueryRepository,
    MikroOrmSellerProductQueryRepository,
    MikroOrmStorefrontProductQueryRepository,
    CatalogStatusService,
    CatalogProductProjectorService,
    StorefrontMarketContextService,
    ResolvedStorefrontPriceService,
    PublicProductOrderHistoryService,
    PublicProductViewHistoryService,
    ProductActivitySessionService,
    ConsumeProductImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    GetPublicProductRecommendationSectionsUseCase,
    IssueProductImageUploadUrlUseCase,
    ListPublicProductsUseCase,
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
    UpdateProductDetailsUseCase,
    ForwardProductInventoryUpdatedToSseListener,
  ],
  exports: [
    CATALOG_CONFIG,
    ProductRecommendationQueryRepository,
    StorefrontProductQueryRepository,
    SellerProductQueryRepository,
    CatalogProductDocumentRepository,
    CatalogSearchDocumentRepository,
    CatalogProductSlugRepository,
    ProductCommandRepository,
    ProductPricingRepository,
    ProductImageService,
    CatalogProductProjectorService,
    StorefrontMarketContextService,
    ResolvedStorefrontPriceService,
    PublicProductOrderHistoryService,
    ConsumeProductImageUploadTicketUseCase,
    CreateProductDraftFacadeUseCase,
    CreateProductDraftUseCase,
    GetProductByIdUseCase,
    GetPublicProductBySlugsUseCase,
    GetPublicProductRecommendationSectionsUseCase,
    IssueProductImageUploadUrlUseCase,
    ListPublicProductsUseCase,
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
    UpdateProductDetailsUseCase,
  ],
})
export class ProductModule {}
