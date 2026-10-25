import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Body of the seller Payout Account onboarding endpoint. Only asserted to be a
 * string here: whether the value is an ISO country code is the Finance domain
 * rule, and whether Stripe supports Connect there is the provider's answer, so a
 * bad country surfaces as a specific payout error rather than a validation
 * failure.
 */
export class StartPayoutOnboardingDto {
  @ApiProperty({
    description:
      'ISO 3166-1 alpha-2 country code where the seller\'s bank account is held.',
    example: 'US',
  })
  @Expose({ name: 'country' })
  @Transform(({ value, obj: source }) => value ?? source.country)
  @IsString()
  country!: string;
}
