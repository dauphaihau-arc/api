import { IsNotEmpty, IsString } from 'class-validator';

export class UnregisterWebPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}
