import type { CategoryQueryRepository } from '~/domains/category/app/ports/category-query.repository';
import type { TextGenerationService } from '~/integrations/ai/app/ports/text-generation.service';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import { GenerateProductDescriptionUseCase } from './generate-product-description.use-case';

describe('GenerateProductDescriptionUseCase', () => {
  it('maps category attributes into prompt facts', async () => {
    const textGenerationService = {
      generateText: jest.fn().mockResolvedValue('Generated description'),
    } as jest.Mocked<TextGenerationService>;
    const categoryQueryRepository = {
      findAllByParentId: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'category-1',
        name: 'Furniture',
        rank: 1,
        attributes: [
          {
            id: 'attr-1',
            key: 'material',
            name: 'Material',
            inputType: 'select',
            isRequired: false,
            rank: 1,
            options: [
              {
                id: 'option-1',
                value: 'Oak',
                rank: 1,
              },
            ],
          },
        ],
      }),
      searchSuggestions: jest.fn(),
    } as jest.Mocked<CategoryQueryRepository>;

    const useCase = new GenerateProductDescriptionUseCase(
      textGenerationService,
      categoryQueryRepository,
    );

    await expect(useCase.execute({
      title: 'Oak side table',
      categoryId: 'category-1',
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      variantType: ProductVariantType.NONE,
      tags: ['oak', 'minimal'],
      attributes: [
        {
          categoryAttributeId: 'attr-1',
          selectedOptionId: 'option-1',
        },
      ],
    })).resolves.toBe('Generated description');

    expect(textGenerationService.generateText).toHaveBeenCalledWith({
      instructions: expect.stringContaining('You write concise ecommerce product descriptions'),
      input: [
        'Title: Oak side table',
        'Category: Furniture',
        'Maker: seller-made',
        'Product type: physical',
        'Variant setup: single offering',
        'Tags: oak, minimal',
        'Attributes: Material: Oak',
      ].join('\n'),
      maxOutputTokens: 600,
    });
  });
});
