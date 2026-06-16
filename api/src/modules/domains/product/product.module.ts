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
import { InternalCatalogController } from './api/rest/internal-catalog.controller';
import { ProductActivityController } from './api/rest/product-activity.controller';
import { ProductController } from './api/rest/product.controller';
import { ProductRecommendationController } from './api/rest/product-recommendation.controller';
import { ProductActivitySessionService } from './api/rest/product-activity-session.service';
import { ProductInventoryEventsController } from './api/rest/product-inventory-events.controller';
import { ProductUploadController } from './api/rest/product-upload.controller';
import { ForwardProductInventoryUpdatedToSseListener } from './listeners/forward-product-inventory-updated-to-sse.listener';
import { ShopProductsController } from '../shop/api/rest/shop-products.controller';
import { AtlasProductRecommendationQueryRepository } from './infra/atlas-product-recommendation-query.repository';
import { MikroOrmProductCommandRepository } from './infra/mikro-orm-product-command.repository';
import { MikroOrmProductRecommendationQueryRepository } from './infra/mikro-orm-product-recommendation-query.repository';
import { MikroOrmSellerProductQueryRepository } from './infra/mikro-orm-seller-product-query.repository';
import { MikroOrmStorefrontProductQueryRepository } from './infra/mikro-orm-storefront-product-query.repository';
import { MongoCatalogProductDocumentRepository } from './infra/mongo-catalog-product-document.repository';
import { MongoCatalogSearchDocumentRepository } from './infra/mongo-catalog-search-document.repository';
import { MongoCatalogProductSlugRepository } from './infra/mongo-catalog-product-slug.repository';
import { AtlasSearchStorefrontProductQueryRepository } from './infra/atlas-search-storefront-product-query.repository';
import { MongoProductRecommendationQueryRepository } from './infra/mongo-product-recommendation-query.repository';
import { MongoStorefrontProductQueryRepository } from './infra/mongo-storefront-product-query.repository';
import { CatalogMongoAccess } from './infra/catalog-mongo.access';
import { ProductAttributeValueEntity } from './infra/persistence/entities/product-attribute-value.entity';
import { ProductImageEntity } from './infra/persistence/entities/product-image.entity';
import { ProductImageVariantEntity } from './infra/persistence/entities/product-image-variant.entity';
import { ProductInventoryReservationEntity } from './infra/persistence/entities/product-inventory-reservation.entity';
import { ProductInventoryEntity } from './infra/persistence/entities/product-inventory.entity';
import { ProductShippingDestinationEntity } from './infra/persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from './infra/persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from './infra/persistence/entities/product-variant.entity';
import { ProductViewHistoryEntity } from './infra/persistence/entities/product-view-history.entity';
import { ProductEntity } from './infra/persistence/entities/product.entity';
import { VariantPriceEntity } from './infra/persistence/entities/variant-price.entity';
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
        MongoStorefrontProductQueryRepository,
      ],
      useFactory: (
        catalogConfig: ReturnType<typeof buildCatalogConfig>,
        atlasSearchStorefrontProductQueryRepository: AtlasSearchStorefrontProductQueryRepository,
        mikroOrmStorefrontProductQueryRepository: MikroOrmStorefrontProductQueryRepository,
        mongoStorefrontProductQueryRepository: MongoStorefrontProductQueryRepository
      ) => {
        if (catalogConfig.driver !== 'mongodb') {
          return mikroOrmStorefrontProductQueryRepository;
        }

        return catalogConfig.searchDriver === 'atlas'
          ? atlasSearchStorefrontProductQueryRepository
          : mongoStorefrontProductQueryRepository;
      },
    },
    {
      provide: ProductRecommendationQueryRepository,
      inject: [
        CATALOG_CONFIG,
        AtlasProductRecommendationQueryRepository,
        MikroOrmProductRecommendationQueryRepository,
        MongoProductRecommendationQueryRepository,
      ],
      useFactory: (
        catalogConfig: ReturnType<typeof buildCatalogConfig>,
        atlasProductRecommendationQueryRepository: AtlasProductRecommendationQueryRepository,
        mikroOrmProductRecommendationQueryRepository: MikroOrmProductRecommendationQueryRepository,
        mongoProductRecommendationQueryRepository: MongoProductRecommendationQueryRepository
      ) => {
        if (catalogConfig.driver !== 'mongodb') {
          return mikroOrmProductRecommendationQueryRepository;
        }

        return catalogConfig.searchDriver === 'atlas'
          ? atlasProductRecommendationQueryRepository
          : mongoProductRecommendationQueryRepository;
      },
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
    MongoProductRecommendationQueryRepository,
    MongoCatalogProductDocumentRepository,
    MongoCatalogSearchDocumentRepository,
    MongoCatalogProductSlugRepository,
    MongoStorefrontProductQueryRepository,
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
