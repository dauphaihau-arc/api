import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CategoryQueryRepository } from '~/domains/category/app/ports/category-query.repository';
import { TextGenerationService } from '~/integrations/ai/app/ports/text-generation.service';
import {
  OPENAI_CONFIG,
  type OpenAiConfig,
} from '~/platform/config/openai.config';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import type { ProductDescriptionAttributeFact } from './generate-product-description.types';

export interface GenerateProductDescriptionInput {
  title: string;
  categoryId?: string;
  whoMade?: ProductWhoMade;
  isDigital?: boolean;
  variantType?: ProductVariantType;
  tags?: string[];
  attributes?: Array<{
    categoryAttributeId: string;
    selectedOptionId?: string;
    selectedText?: string;
  }>;
}

@Injectable()
export class GenerateProductDescriptionUseCase {
  constructor(
    private readonly textGenerationService: TextGenerationService,
    @Inject(CategoryQueryRepository)
    private readonly categoryQueryRepository: CategoryQueryRepository,
    @Inject(OPENAI_CONFIG)
    private readonly openAiConfig: Pick<
      OpenAiConfig,
      'defaultModel' | 'productDescriptionEnabled'
    >,
  ) {}

  async execute(input: GenerateProductDescriptionInput): Promise<string> {
    if (!this.openAiConfig.productDescriptionEnabled) {
      throw new ServiceUnavailableException(
        'AI description generation is temporarily unavailable.',
      );
    }

    const category = input.categoryId
      ? await this.categoryQueryRepository.findById(input.categoryId)
      : null;

    const promptInput = {
      title: input.title.trim(),
      categoryName: category?.name,
      whoMade: input.whoMade ? humanizeWhoMade(input.whoMade) : undefined,
      isDigital: input.isDigital,
      variantType: input.variantType
        ? humanizeVariantType(input.variantType)
        : undefined,
      tags: sanitizeTags(input.tags),
      attributes: resolveAttributeFacts(category, input.attributes),
    };

    return this.textGenerationService.generateText({
      instructions: buildInstructions(),
      input: buildPromptInput(promptInput),
      model: this.openAiConfig.defaultModel,
      maxOutputTokens: 600,
    });
  }
}

function sanitizeTags(tags?: string[]): string[] {
  if (!tags?.length) {
    return [];
  }

  return tags.map((tag) => tag.trim()).filter(Boolean);
}

function resolveAttributeFacts(
  category: Awaited<ReturnType<CategoryQueryRepository['findById']>>,
  attributes?: GenerateProductDescriptionInput['attributes'],
): ProductDescriptionAttributeFact[] {
  if (!category || !attributes?.length) {
    return [];
  }

  return attributes.flatMap((attribute) => {
    const categoryAttribute = category.attributes.find(
      (candidate) => candidate.id === attribute.categoryAttributeId,
    );

    if (!categoryAttribute) {
      return [];
    }

    const selectedValue = attribute.selectedText?.trim()
      || categoryAttribute.options.find(
        (option) => option.id === attribute.selectedOptionId,
      )?.value;

    if (!selectedValue) {
      return [];
    }

    return [
      {
        name: categoryAttribute.name,
        value: selectedValue,
      },
    ];
  });
}

function humanizeWhoMade(whoMade: ProductWhoMade): string {
  switch (whoMade) {
    case ProductWhoMade.I_DID:
      return 'seller-made';
    case ProductWhoMade.COLLECTIVE:
      return 'team-made';
    case ProductWhoMade.SOMEONE_ELSE:
      return 'designed or sourced by another maker';
    default:
      return whoMade;
  }
}

function humanizeVariantType(variantType: ProductVariantType): string {
  switch (variantType) {
    case ProductVariantType.NONE:
      return 'single offering';
    case ProductVariantType.SINGLE:
      return 'one variant group';
    case ProductVariantType.COMBINE:
      return 'multiple variant groups';
    default:
      return variantType;
  }
}

function buildInstructions(): string {
  return [
    'You write concise ecommerce product descriptions for a marketplace seller.',
    'Use only the product facts provided.',
    'Do not invent materials, dimensions, certifications, compatibility, or guarantees.',
    'Avoid markdown, bullet lists, and quotation marks.',
    'Return plain text only.',
    'Keep the description under 1200 characters.',
    'Write in a clear, conversion-friendly tone.',
  ].join(' ');
}

function buildPromptInput(input: {
  title: string;
  categoryName?: string;
  whoMade?: string;
  isDigital?: boolean;
  variantType?: string;
  tags: string[];
  attributes: ProductDescriptionAttributeFact[];
}): string {
  return [
    `Title: ${input.title}`,
    input.categoryName ? `Category: ${input.categoryName}` : undefined,
    input.whoMade ? `Maker: ${input.whoMade}` : undefined,
    typeof input.isDigital === 'boolean'
      ? `Product type: ${input.isDigital ? 'digital' : 'physical'}`
      : undefined,
    input.variantType ? `Variant setup: ${input.variantType}` : undefined,
    input.tags.length ? `Tags: ${input.tags.join(', ')}` : undefined,
    input.attributes.length
      ? `Attributes: ${input.attributes.map((attribute) => `${attribute.name}: ${attribute.value}`).join('; ')}`
      : undefined,
  ].filter(Boolean).join('\n');
}
