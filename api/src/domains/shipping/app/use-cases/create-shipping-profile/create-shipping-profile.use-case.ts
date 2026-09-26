import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  InvalidShippingProfileError,
  ShippingProfileNameTakenError,
} from '../../errors/shipping-app.error';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { normalizeShippingProfileConfiguration, normalizeShippingProfileName } from '../../services/shipping-profile-configuration';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView, ShippingRateInput } from '../../shipping.types';

export interface CreateShippingProfileInput {
  name: string;
  status?: ShippingProfileStatus;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates?: ShippingRateInput[];
}

export type CreateShippingProfileError =
  | InvalidShippingProfileError
  | ShippingProfileNameTakenError;

@Injectable()
export class CreateShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
  ) {}

  async execute(
    shopId: string,
    input: CreateShippingProfileInput,
  ): Promise<Result<ShippingProfileView, CreateShippingProfileError>> {
    const normalized = normalizeShippingProfileConfiguration({
      name: input.name,
      status: input.status ?? ShippingProfileStatus.DRAFT,
      shipFromCountry: input.shipFromCountry,
      shipFromPostal: input.shipFromPostal,
      processingTimeMinDays: input.processingTimeMinDays,
      processingTimeMaxDays: input.processingTimeMaxDays,
      rates: input.rates ?? [],
    });

    if ('error' in normalized) {
      return err(normalized.error);
    }

    const existing = await this.shippingProfileRepository.findByNormalizedName(
      shopId,
      normalizeShippingProfileName(normalized.configuration.name),
    );

    if (existing) {
      return err(new ShippingProfileNameTakenError(normalized.configuration.name));
    }

    const profile = await this.shippingProfileRepository.create({
      shopId,
      ...normalized.configuration,
    });

    return ok(toShippingProfileView(profile, []));
  }
}
