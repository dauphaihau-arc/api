import type { ConfigService } from '@nestjs/config';

export interface OpenAiConfig {
  apiKey?: string;
  productDescriptionEnabled: boolean;
  baseUrl: string;
  productDescriptionModel: string;
  timeoutMs: number;
}

export const OPENAI_CONFIG = Symbol('OPENAI_CONFIG');

export function buildOpenAiConfig(
  configService: Pick<ConfigService, 'get'>
): OpenAiConfig {
  return {
    apiKey: configService.get<string>('OPENAI_API_KEY'),
    productDescriptionEnabled:
      configService.get<string>('AI_PRODUCT_DESCRIPTION_ENABLED', 'true') === 'true',
    baseUrl: configService.get<string>(
      'OPENAI_BASE_URL',
      'https://api.openai.com/v1'
    ),
    productDescriptionModel: configService.get<string>(
      'OPENAI_PRODUCT_DESCRIPTION_MODEL',
      'gpt-5.4-nano'
    ),
    timeoutMs: Number(configService.get<string>('OPENAI_TIMEOUT_MS', '10000')),
  };
}
