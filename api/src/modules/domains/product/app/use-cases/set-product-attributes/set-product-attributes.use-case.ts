import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import type { CategoryAttributeSummary } from '~/modules/domains/category/app/category.types';
import { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductAttributeSelectionError,
  ProductNotFoundError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductAttributesInput {
  attributes: Array<{
    categoryAttributeId: string;
    selectedOptionId?: string;
    selectedText?: string;
  }>;
}

type SetProductAttributesError =
  | ActorCannotCreateProductDraftError
  | InvalidProductAttributeSelectionError
  | ProductNotFoundError;

@Injectable()
export class SetProductAttributesUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository,
    private readonly categoryRepository: CategoryRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductAttributesInput
  ): Promise<Result<ProductDraftSummary, SetProductAttributesError>> {
    const existingProduct = await this.productRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    if (!existingProduct.categoryId) {
      return err(
        new InvalidProductAttributeSelectionError(
          'Product category is required before setting attribute values'
        )
      );
    }

    const category = await this.categoryRepository.findById(
      existingProduct.categoryId
    );

    if (!category) {
      return err(
        new InvalidProductAttributeSelectionError(
          'Product category metadata is missing'
        )
      );
    }

    const validationError = validateAttributePayload(
      category.attributes,
      input.attributes
    );

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productRepository.replaceAttributeValues({
      productId,
      attributes: input.attributes.map((attribute) => ({
        categoryAttributeId: attribute.categoryAttributeId,
        selectedOptionId: attribute.selectedOptionId,
        selectedText: attribute.selectedText?.trim() || undefined,
      })),
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(product);
  }
}

function validateAttributePayload(
  categoryAttributes: CategoryAttributeSummary[],
  selectedAttributes: SetProductAttributesInput['attributes']
): InvalidProductAttributeSelectionError | null {
  const attributeById = new Map(
    categoryAttributes.map((attribute) => [attribute.id, attribute])
  );
  const providedAttributeIds = new Set<string>();

  for (const selectedAttribute of selectedAttributes) {
    const attribute = attributeById.get(selectedAttribute.categoryAttributeId);

    if (!attribute) {
      return new InvalidProductAttributeSelectionError(
        `Unknown category attribute "${selectedAttribute.categoryAttributeId}" for this product category`
      );
    }

    if (providedAttributeIds.has(selectedAttribute.categoryAttributeId)) {
      return new InvalidProductAttributeSelectionError(
        `Duplicate category attribute "${selectedAttribute.categoryAttributeId}" is not allowed`
      );
    }

    providedAttributeIds.add(selectedAttribute.categoryAttributeId);

    if (attribute.inputType === 'select') {
      if (!selectedAttribute.selectedOptionId) {
        return new InvalidProductAttributeSelectionError(
          `Attribute "${attribute.name}" requires a selected option`
        );
      }

      if (selectedAttribute.selectedText?.trim()) {
        return new InvalidProductAttributeSelectionError(
          `Attribute "${attribute.name}" does not accept free-form text`
        );
      }

      const matchingOption = attribute.options.find(
        (option) => option.id === selectedAttribute.selectedOptionId
      );

      if (!matchingOption) {
        return new InvalidProductAttributeSelectionError(
          `Selected option "${selectedAttribute.selectedOptionId}" is not valid for attribute "${attribute.name}"`
        );
      }

      continue;
    }

    if (attribute.inputType === 'text') {
      if (selectedAttribute.selectedOptionId) {
        return new InvalidProductAttributeSelectionError(
          `Attribute "${attribute.name}" does not accept option selections`
        );
      }

      if (!selectedAttribute.selectedText?.trim()) {
        return new InvalidProductAttributeSelectionError(
          `Attribute "${attribute.name}" requires text input`
        );
      }

      continue;
    }

    return new InvalidProductAttributeSelectionError(
      `Attribute "${attribute.name}" uses unsupported input type "${attribute.inputType}"`
    );
  }

  const missingRequiredAttribute = categoryAttributes.find(
    (attribute) => attribute.isRequired && !providedAttributeIds.has(attribute.id)
  );

  if (missingRequiredAttribute) {
    return new InvalidProductAttributeSelectionError(
      `Required attribute "${missingRequiredAttribute.name}" must be provided`
    );
  }

  return null;
}
