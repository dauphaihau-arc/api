import type {
  CreateProductDraftRepositoryInput,
  ProductDraftSummary,
  ReplaceProductAttributeValuesRepositoryInput,
  ReplaceProductImagesRepositoryInput,
  ReplaceProductImagesRepositoryResult,
  ReplaceProductInventoryRepositoryInput,
  ReplaceProductShippingRepositoryInput,
  ReplaceProductVariantsRepositoryInput,
  UpdateProductDetailsRepositoryInput
} from '../product.types';

export abstract class ProductCommandRepository {
  abstract createDraft(
    input: CreateProductDraftRepositoryInput
  ): Promise<ProductDraftSummary>;

  abstract replaceImages(
    input: ReplaceProductImagesRepositoryInput
  ): Promise<ReplaceProductImagesRepositoryResult | null>;

  abstract replaceAttributeValues(
    input: ReplaceProductAttributeValuesRepositoryInput
  ): Promise<ProductDraftSummary | null>;

  abstract replaceVariants(
    input: ReplaceProductVariantsRepositoryInput
  ): Promise<ProductDraftSummary | null>;

  abstract replaceInventory(
    input: ReplaceProductInventoryRepositoryInput
  ): Promise<ProductDraftSummary | null>;

  abstract replaceShipping(
    input: ReplaceProductShippingRepositoryInput
  ): Promise<ProductDraftSummary | null>;

  abstract updateDetails(
    input: UpdateProductDetailsRepositoryInput
  ): Promise<ProductDraftSummary | null>;

  abstract updateState(
    productId: string,
    state: ProductDraftSummary['state']
  ): Promise<ProductDraftSummary | null>;

  abstract publish(productId: string): Promise<ProductDraftSummary | null>;
}
