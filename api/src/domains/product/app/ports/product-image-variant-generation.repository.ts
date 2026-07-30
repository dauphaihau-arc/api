import type { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import type { ProductEntity } from '../../infra/persistence/mikro-orm/entities/product.entity';
import type { ProductImageEntity } from '../../infra/persistence/mikro-orm/entities/product-image.entity';
import type { ProductImageVariantEntity } from '../../infra/persistence/mikro-orm/entities/product-image-variant.entity';

export abstract class ProductImageVariantGenerationRepository {
  abstract findProductForVariantGeneration(productId: string): Promise<ProductEntity | null>;

  abstract createVariant(input: {
    image: ProductImageEntity;
    variant: ProductImageVariant;
    storageKey: string;
    width?: number;
    height?: number;
    format?: string;
  }): ProductImageVariantEntity;

  abstract removeVariant(variant: ProductImageVariantEntity): void;

  abstract flush(): Promise<void>;
}
