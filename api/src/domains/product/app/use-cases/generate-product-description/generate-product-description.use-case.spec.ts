import { ServiceUnavailableException } from '@nestjs/common';
import type { CategoryQueryRepository } from '~/domains/category/app/ports/category-query.repository';
import type { TextGenerationService } from '~/integrations/ai/app/ports/text-generation.service';
import { GenerateProductDescriptionUseCase } from './generate-product-description.use-case';

describe('GenerateProductDescriptionUseCase', () => {
  it('rejects generation when AI product descriptions are disabled', async () => {
    const textGenerationService = {
      generateText: jest.fn(),
    } as jest.Mocked<TextGenerationService>;
    const categoryQueryRepository = {
      findAllByParentId: jest.fn(),
      findById: jest.fn(),
      searchSuggestions: jest.fn(),
    } as jest.Mocked<CategoryQueryRepository>;

    const useCase = new GenerateProductDescriptionUseCase(
      textGenerationService,
      categoryQueryRepository,
      {
        defaultModel: 'gpt-test',
        productDescriptionEnabled: false,
      },
    );

    await expect(useCase.execute({
      title: 'Oak side table',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(textGenerationService.generateText).not.toHaveBeenCalled();
  });
});
