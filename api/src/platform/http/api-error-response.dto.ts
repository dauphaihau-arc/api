import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Public error response emitted by every JSON API endpoint.
 *
 * Mirrors `PublicHttpErrorResponse`; keep both in sync.
 */
export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code. Always matches the response status line.',
  })
  status_code!: number;

  @ApiProperty({
    description: 'Stable, machine-readable error code.',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error summary.',
  })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Request correlation id. Also returned in the X-Request-Id response header and logged.',
    example: '3f6c1b1e-2b0f-4d5a-9d0e-7a1f2c3b4d5e',
  })
  request_id?: string;

  @ApiPropertyOptional({
    description:
      'Structured, error-specific context. Validation failures expose `fields`.',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}
