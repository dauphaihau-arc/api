import { Injectable } from '@nestjs/common';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import {
  DEFAULT_STOREFRONT_LANGUAGE,
  normalizeStorefrontLanguage,
  resolveLocalizedValue,
} from '~/platform/localization/storefront-language';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { ProductTranslationQueryRepository } from '../ports/product-translation-query.repository';

interface LocalizableProductCard {
  id: string;
  title: string;
}

interface LocalizableProductDetail extends LocalizableProductCard {
  description: string;
}

/**
 * Resolves the Localized Content a public product read renders. The active
 * Storefront Language comes from `X-Locale` through the request context;
 * English always reads the base source values.
 */
@Injectable()
export class PublicProductLocalizationService {
  constructor(
    private readonly productTranslationQueryRepository: ProductTranslationQueryRepository,
    private readonly requestContextService: RequestContextService,
  ) {}

  getStorefrontLanguage(): StorefrontLanguage {
    return normalizeStorefrontLanguage(this.requestContextService.get().locale);
  }

  async localizeProductDetail<T extends LocalizableProductDetail>(
    product: T,
  ): Promise<T> {
    const language = this.getStorefrontLanguage();

    if (language === DEFAULT_STOREFRONT_LANGUAGE) {
      return product;
    }

    const translations =
      await this.productTranslationQueryRepository.findProductTranslations(
        [product.id],
        language,
      );
    const translation = translations.get(product.id);

    if (!translation) {
      return product;
    }

    return {
      ...product,
      title: resolveLocalizedValue(language, product.title, translation.title),
      description: resolveLocalizedValue(
        language,
        product.description,
        translation.description,
      ),
    };
  }

  async localizeProductCards<T extends LocalizableProductCard>(
    products: T[],
  ): Promise<T[]> {
    const language = this.getStorefrontLanguage();

    if (language === DEFAULT_STOREFRONT_LANGUAGE || products.length === 0) {
      return products;
    }

    const translations =
      await this.productTranslationQueryRepository.findProductTranslations(
        products.map((product) => product.id),
        language,
      );

    return products.map((product) => {
      const translation = translations.get(product.id);

      if (!translation) {
        return product;
      }

      return {
        ...product,
        title: resolveLocalizedValue(language, product.title, translation.title),
      };
    });
  }
}
