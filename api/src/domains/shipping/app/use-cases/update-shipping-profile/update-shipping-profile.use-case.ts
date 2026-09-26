import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import {
  InvalidShippingProfileError,
  ShippingProfileArchivedError,
  ShippingProfileNameTakenError,
  ShippingProfileNotFoundError,
  ShippingProfileReadinessRequiredError,
  ShippingProfileVersionConflictError,
} from '../../errors/shipping-app.error';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { normalizeShippingProfileConfiguration } from '../../services/shipping-profile-configuration';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView, ShippingRateInput } from '../../shipping.types';

export interface UpdateShippingProfileInput {
  version: number;
  name?: string;
  status?: ShippingProfileStatus;
  shipFromCountry?: string | null;
  shipFromPostal?: string | null;
  processingTimeMinDays?: number | null;
  processingTimeMaxDays?: number | null;
  rates?: ShippingRateInput[];
}

export type UpdateShippingProfileError =
  | InvalidShippingProfileError
  | ShippingProfileNameTakenError
  | ShippingProfileNotFoundError
  | ShippingProfileVersionConflictError
  | ShippingProfileArchivedError
  | ShippingProfileReadinessRequiredError;

@Injectable()
export class UpdateShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
    input: UpdateShippingProfileInput,
  ): Promise<Result<ShippingProfileView, UpdateShippingProfileError>> {
    const existing = await this.shippingProfileRepository.findById(shopId, shippingProfileId);

    if (!existing) {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    if (existing.status === ShippingProfileStatus.ARCHIVED) {
      return err(new ShippingProfileArchivedError());
    }

    if (existing.version !== input.version) {
      return err(new ShippingProfileVersionConflictError(existing));
    }

    const normalized = normalizeShippingProfileConfiguration({
      name: input.name ?? existing.name,
      status: input.status ?? existing.status,
      shipFromCountry: input.shipFromCountry === undefined
        ? existing.shipFromCountry
        : input.shipFromCountry ?? undefined,
      shipFromPostal: input.shipFromPostal === undefined
        ? existing.shipFromPostal
        : input.shipFromPostal ?? undefined,
      processingTimeMinDays: input.processingTimeMinDays === undefined
        ? existing.processingTimeMinDays
        : input.processingTimeMinDays ?? undefined,
      processingTimeMaxDays: input.processingTimeMaxDays === undefined
        ? existing.processingTimeMaxDays
        : input.processingTimeMaxDays ?? undefined,
      rates: input.rates ?? existing.rates,
    });

    if ('error' in normalized) {
      return err(normalized.error);
    }

    if (normalized.configuration.normalizedName !== existing.name.trim().toLowerCase()) {
      const nameOwner = await this.shippingProfileRepository.findByNormalizedName(
        shopId,
        normalized.configuration.normalizedName,
      );

      if (nameOwner && nameOwner.id !== existing.id) {
        return err(new ShippingProfileNameTakenError(normalized.configuration.name));
      }
    }

    const outcome = await this.shippingProfileRepository.update({
      shopId,
      shippingProfileId,
      expectedVersion: input.version,
      ...normalized.configuration,
    });

    if (outcome.status === 'published_products_reference') {
      return err(new ShippingProfileReadinessRequiredError(outcome.publishedProductCount));
    }

    if (outcome.status === 'version_conflict') {
      // Changed by someone else, or gone? Re-read without the version to tell the two
      // apart, so the caller gets 409 or 404.
      const current = await this.shippingProfileRepository.findById(shopId, shippingProfileId);
      if (!current) {
        return err(new ShippingProfileNotFoundError(shippingProfileId));
      }

      return err(new ShippingProfileVersionConflictError(current));
    }

    const updated = outcome.profile;
    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
      updated.id,
    ]);

    // Editing a shared profile changes every assigned Product's shipping
    // facts, so their public catalog projection must be rebuilt explicitly.
    for (const assignment of assignments) {
      await this.jobDispatcher?.dispatch(
        appJobName.projectCatalogProduct,
        { productId: assignment.productId },
        {
          deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(assignment.productId),
          deduplicationMode: 'coalesce-latest',
        },
      );
    }

    return ok(toShippingProfileView(updated, assignments));
  }
}
