import { Type } from 'class-transformer';
import {
  Allow,
  IsNotEmpty,
  IsString,
  ValidateNested
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

  @Allow()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => WebPushSubscriptionKeysDto)
  keys!: WebPushSubscriptionKeysDto;
}
