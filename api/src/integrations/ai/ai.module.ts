import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OPENAI_CONFIG, buildOpenAiConfig } from '~/platform/config/openai.config';
import { TextGenerationService } from './app/ports/text-generation.service';
import { OpenAiTextGenerationService } from './infra/openai/openai-text-generation.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OPENAI_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildOpenAiConfig(configService),
    },
    OpenAiTextGenerationService,
    {
      provide: TextGenerationService,
      useExisting: OpenAiTextGenerationService,
    },
  ],
  exports: [OPENAI_CONFIG, TextGenerationService],
})
export class AiModule {}
