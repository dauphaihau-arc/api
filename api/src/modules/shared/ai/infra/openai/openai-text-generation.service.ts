import {
  BadGatewayException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException
} from '@nestjs/common';
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError
} from 'openai';
import {
  OPENAI_CONFIG,
  type OpenAiConfig
} from '~/config/openai.config';
import type { GenerateTextInput } from '../../app/ai.types';
import { TextGenerationService } from '../../app/ports/text-generation.service';

@Injectable()
export class OpenAiTextGenerationService implements TextGenerationService {
  private readonly client?: OpenAI;

  constructor(
    @Inject(OPENAI_CONFIG) private readonly openAiConfig: OpenAiConfig
  ) {
    if (openAiConfig.productDescriptionEnabled && openAiConfig.apiKey) {
      this.client = new OpenAI({
        apiKey: openAiConfig.apiKey,
        baseURL: openAiConfig.baseUrl,
        timeout: openAiConfig.timeoutMs,
      });
    }
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    if (!this.openAiConfig.productDescriptionEnabled) {
      throw new ServiceUnavailableException(
        'AI description generation is temporarily unavailable.'
      );
    }

    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI description generation is temporarily unavailable.'
      );
    }

    try {
      const response = await this.client.responses.create({
        model: this.openAiConfig.productDescriptionModel,
        reasoning: {
          effort: 'low',
        },
        max_output_tokens: input.maxOutputTokens ?? 600,
        instructions: input.instructions,
        input: input.input,
      });

      const outputText = response.output_text.trim();

      if (!outputText) {
        throw new BadGatewayException('OpenAI returned an empty response.');
      }

      return outputText;
    }
    catch (error) {
      if (error instanceof ServiceUnavailableException
        || error instanceof BadGatewayException) {
        throw error;
      }

      if (error instanceof APIConnectionTimeoutError) {
        throw new ServiceUnavailableException(
          'AI description generation is temporarily unavailable.',
          {
            cause: error,
          }
        );
      }

      if (error instanceof APIConnectionError) {
        throw new ServiceUnavailableException(
          'AI description generation is temporarily unavailable.',
          {
            cause: error,
          }
        );
      }

      if (error instanceof APIError) {
        if (error.status === 429) {
          throw new ServiceUnavailableException(
            'AI description generation is temporarily unavailable.',
            {
              cause: error,
            }
          );
        }

        throw new BadGatewayException(
          'AI description generation is temporarily unavailable.',
          {
            cause: error,
          }
        );
      }

      throw new InternalServerErrorException(
        'AI description generation is temporarily unavailable.',
        {
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }
}
