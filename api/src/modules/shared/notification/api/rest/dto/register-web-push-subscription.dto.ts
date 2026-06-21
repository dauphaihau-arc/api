import { Expose, Transform, Type } from 'class-transformer';
import {
  Allow,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

class WebPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class RegisterWebPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @Expose({ name: 'expiration_time' })
  @Transform(({ value, obj: source }) => value ?? source.expiration_time)
  @Allow()
  expiration_time?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}
