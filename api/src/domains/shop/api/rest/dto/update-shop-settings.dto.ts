import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The store settings a seller may change on their own shop.
 *
 * `timezone` is the IANA zone the shop authors Sale schedules in. It only
 * supplies the default for a new Sale; existing Sales keep the timezone they
 * were created with.
 */
export class UpdateShopSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @ApiProperty({
    name: 'timezone',
    description: 'IANA timezone new Sale schedules default to.',
    example: 'Asia/Saigon',
  })
  timezone!: string;
}
