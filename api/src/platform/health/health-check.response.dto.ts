import { ApiProperty } from '@nestjs/swagger';

class HealthComponentResponseDto {
  @ApiProperty({
    enum: ['ok', 'error'],
  })
  status!: 'ok' | 'error';

  @ApiProperty({
    required: false,
  })
  details?: string;
}

class HealthComponentsResponseDto {
  @ApiProperty({
    type: () => HealthComponentResponseDto,
  })
  db!: HealthComponentResponseDto;

  @ApiProperty({
    type: () => HealthComponentResponseDto,
  })
  storage!: HealthComponentResponseDto;

  @ApiProperty({
    type: () => HealthComponentResponseDto,
  })
  catalog!: HealthComponentResponseDto;

  @ApiProperty({
    type: () => HealthComponentResponseDto,
    required: false,
  })
  redis?: HealthComponentResponseDto;

  @ApiProperty({
    type: () => HealthComponentResponseDto,
    required: false,
  })
  queue?: HealthComponentResponseDto;
}

export class HealthCheckResponseDto {
  @ApiProperty({
    enum: ['ok', 'error'],
  })
  status!: 'ok' | 'error';

  @ApiProperty({
    format: 'date-time',
  })
  timestamp!: string;

  @ApiProperty({
    type: () => HealthComponentsResponseDto,
  })
  components!: HealthComponentsResponseDto;
}
