import { Injectable } from '@nestjs/common';
import { ok, type Result } from '~/platform/application/result';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import {
  SHIPPING_PROFILE_LIST_STATUSES_WITHOUT_ARCHIVED,
  type ShippingProfileListResult,
} from '../../shipping.types';

export interface ListShippingProfilesQuery {
  page: number;
  limit: number;
  /**
   * Lifecycle states to list. Absent means the actionable set: archived
   * profiles are retained for audit but are not part of the working list.
   */
  statuses?: ShippingProfileStatus[];
}

@Injectable()
export class ListShippingProfilesUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
  ) {}

  async execute(
    shopId: string,
    query: ListShippingProfilesQuery,
  ): Promise<Result<ShippingProfileListResult, never>> {
    const statuses = query.statuses?.length
      ? query.statuses
      : SHIPPING_PROFILE_LIST_STATUSES_WITHOUT_ARCHIVED;

    const [{ items: profiles, total }, statusCounts] = await Promise.all([
      this.shippingProfileRepository.listByShop(shopId, {
        page: query.page,
        limit: query.limit,
        statuses,
      }),
      this.shippingProfileRepository.countByStatus(shopId),
    ]);

    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds(
      profiles.map((profile) => profile.id),
    );

    const assignmentsByProfileId = new Map<string, typeof assignments>();

    for (const assignment of assignments) {
      const existing = assignmentsByProfileId.get(assignment.shippingProfileId) ?? [];
      existing.push(assignment);
      assignmentsByProfileId.set(assignment.shippingProfileId, existing);
    }

    return ok({
      results: profiles.map((profile) =>
        toShippingProfileView(profile, assignmentsByProfileId.get(profile.id) ?? [])),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      totalResults: total,
      statusCounts,
    });
  }
}
