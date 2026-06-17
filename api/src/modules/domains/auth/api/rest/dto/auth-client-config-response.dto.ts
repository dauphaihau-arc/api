import type { AuthConfig } from '~/config/auth.config';
import type { OpenAiConfig } from '~/config/openai.config';
import { ApiProperty } from '@nestjs/swagger';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_PATTERN
} from '../validation/password-validation';

class AuthPasswordRequirementsResponseDto {
  @ApiProperty()
  lowercase!: boolean;

  @ApiProperty()
  uppercase!: boolean;

  @ApiProperty()
  number!: boolean;

  @ApiProperty({
    name: 'special_character',
  })
  special_character!: boolean;
}

class AuthPasswordConfigResponseDto {
  @ApiProperty({
    name: 'min_length',
  })
  min_length!: number;

  @ApiProperty({
    name: 'max_length',
  })
  max_length!: number;

  @ApiProperty()
  pattern!: string;

  @ApiProperty({
    type: () => AuthPasswordRequirementsResponseDto,
  })
  requirements!: AuthPasswordRequirementsResponseDto;

  @ApiProperty()
  message!: string;
}

class AuthSessionConfigResponseDto {
  @ApiProperty({
    name: 'access_token_ttl_seconds',
  })
  access_token_ttl_seconds!: number;

  @ApiProperty({
    name: 'refresh_token_ttl_seconds',
  })
  refresh_token_ttl_seconds!: number;
}

class AuthAiConfigResponseDto {
  @ApiProperty({
    name: 'product_description_enabled',
  })
  product_description_enabled!: boolean;
}

export class AuthClientConfigResponseDto {
  @ApiProperty()
  version!: string;

  @ApiProperty({
    type: () => AuthPasswordConfigResponseDto,
  })
  password!: AuthPasswordConfigResponseDto;

  @ApiProperty({
    type: () => AuthSessionConfigResponseDto,
  })
  session!: AuthSessionConfigResponseDto;

  @ApiProperty({
    type: () => AuthAiConfigResponseDto,
  })
  ai!: AuthAiConfigResponseDto;

  static create(
    authConfig: AuthConfig,
    openAiConfig: Pick<OpenAiConfig, 'productDescriptionEnabled'>
  ): AuthClientConfigResponseDto {
    return {
      version: '2026-05-20',
      password: {
        min_length: AUTH_PASSWORD_MIN_LENGTH,
        max_length: AUTH_PASSWORD_MAX_LENGTH,
        pattern: AUTH_PASSWORD_PATTERN.source,
        requirements: {
          lowercase: true,
          uppercase: true,
          number: true,
          special_character: true,
        },
        message:
          'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
      },
      session: {
        access_token_ttl_seconds: authConfig.jwtAccessTtlSeconds,
        refresh_token_ttl_seconds: authConfig.jwtRefreshTtlSeconds,
      },
      ai: {
        product_description_enabled: openAiConfig.productDescriptionEnabled,
      },
    };
  }
}
