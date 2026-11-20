import type { RequestContextService } from '~/platform/request-context/request-context.service';
import type { ProductTranslationQueryRepository } from '../ports/product-translation-query.repository';
import { PublicProductLocalizationService } from './public-product-localization.service';

interface ProductCardText {
  id: string;
  title: string;
  slug: string;
}

interface ProductDetailText extends ProductCardText {
  description: string;
}

type TranslationRepositoryMock = jest.Mocked<
  Pick<ProductTranslationQueryRepository, 'findProductTranslations'>
>;

function buildService(locale?: string | null) {
  const translationRepository: TranslationRepositoryMock = {
    findProductTranslations: jest.fn().mockResolvedValue(new Map()),
  };
  const requestContextService = {
    get: jest.fn().mockReturnValue({ locale }),
  } as unknown as jest.Mocked<Pick<RequestContextService, 'get'>>;

  return {
    translationRepository,
    requestContextService,
    service: new PublicProductLocalizationService(
      translationRepository as never,
      requestContextService as never,
    ),
  };
}

const card: ProductCardText = {
  id: 'product-1',
  title: 'Linen Dress',
  slug: 'linen-dress',
};

const detail: ProductDetailText = {
  ...card,
  description: 'Relaxed linen dress',
};

describe('PublicProductLocalizationService', () => {
  it.each(['vi-VN', 'vi-US', 'vi'])(
    'reads Vietnamese content for %s',
    async (locale) => {
      const { service, translationRepository } = buildService(locale);
      translationRepository.findProductTranslations.mockResolvedValue(
        new Map([[
          'product-1',
          { title: 'Váy lanh', description: 'Váy lanh nhẹ' },
        ]]),
      );

      await expect(service.localizeProductDetail(detail)).resolves.toEqual({
        ...detail,
        title: 'Váy lanh',
        description: 'Váy lanh nhẹ',
      });
      expect(translationRepository.findProductTranslations).toHaveBeenCalledWith(
        ['product-1'],
        'vi',
      );
    },
  );

  it.each([undefined, null, '', 'en-US', 'en-VN', 'fr-FR'])(
    'reads base English content for %s without a translation lookup',
    async (locale) => {
      const { service, translationRepository } = buildService(locale);
      translationRepository.findProductTranslations.mockResolvedValue(
        new Map([['product-1', { title: 'Váy lanh', description: 'Váy lanh nhẹ' }]]),
      );

      await expect(service.localizeProductDetail(detail)).resolves.toEqual(detail);
      await expect(service.localizeProductCards([card])).resolves.toEqual([card]);
      expect(translationRepository.findProductTranslations).not.toHaveBeenCalled();
    },
  );

  it('falls back per field when only one Vietnamese translation exists', async () => {
    const { service, translationRepository } = buildService('vi-VN');
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([['product-1', { title: 'Váy lanh', description: null }]]),
    );

    await expect(service.localizeProductDetail(detail)).resolves.toEqual({
      ...detail,
      title: 'Váy lanh',
      description: 'Relaxed linen dress',
    });
  });

  it('falls back to the base title when the Vietnamese row omits it', async () => {
    const { service, translationRepository } = buildService('vi-VN');
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([['product-1', { title: undefined, description: 'Váy lanh nhẹ' }]]),
    );

    await expect(service.localizeProductDetail(detail)).resolves.toEqual({
      ...detail,
      title: 'Linen Dress',
      description: 'Váy lanh nhẹ',
    });
  });

  it('preserves an explicitly empty translated value', async () => {
    const { service, translationRepository } = buildService('vi-VN');
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([['product-1', { title: '', description: 'Váy lanh nhẹ' }]]),
    );

    await expect(service.localizeProductDetail(detail)).resolves.toEqual({
      ...detail,
      title: '',
      description: 'Váy lanh nhẹ',
    });
  });

  it('batches card titles in one lookup and preserves slugs and other fields', async () => {
    const { service, translationRepository } = buildService('vi-VN');
    const cards: ProductCardText[] = [
      { id: 'product-1', title: 'Linen Dress', slug: 'linen-dress' },
      { id: 'product-2', title: 'Silk Scarf', slug: 'silk-scarf' },
      { id: 'product-3', title: 'Wool Hat', slug: 'wool-hat' },
    ];
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([
        ['product-1', { title: 'Váy lanh' }],
        ['product-2', { title: null }],
      ]),
    );

    await expect(service.localizeProductCards(cards)).resolves.toEqual([
      { id: 'product-1', title: 'Váy lanh', slug: 'linen-dress' },
      { id: 'product-2', title: 'Silk Scarf', slug: 'silk-scarf' },
      { id: 'product-3', title: 'Wool Hat', slug: 'wool-hat' },
    ]);
    expect(translationRepository.findProductTranslations).toHaveBeenCalledTimes(1);
    expect(translationRepository.findProductTranslations).toHaveBeenCalledWith(
      ['product-1', 'product-2', 'product-3'],
      'vi',
    );
  });

  it('does not query translations for an empty batch', async () => {
    const { service, translationRepository } = buildService('vi-VN');

    await expect(service.localizeProductCards([])).resolves.toEqual([]);
    expect(translationRepository.findProductTranslations).not.toHaveBeenCalled();
  });
});
