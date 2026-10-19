import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { PayoutAccountNotFoundError } from '../../errors/finance-app.error';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import { assertValidPayoutAccountVerificationStatus } from '../../../domain/rules/payout-account';

export interface RecordShopPayoutAccountVerificationInput {
  shopId: string;
  shopPublicId: string;
  status: string;
}

/**
 * Records an operator's verification decision on a shop's open Payout Account:
 * the only path that changes `status`, so a seller can never mark their own
 * destination payable. Moving to `active` stamps `verified_at` while it is still
 * null, `disabled` leaves any earlier verification alone, and repeating the
 * current status persists nothing. Either way the decision is audited by the
 * previous and new status and the masked last4, never by the reference.
 */
@Injectable()
export class RecordShopPayoutAccountVerificationUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(
    input: RecordShopPayoutAccountVerificationInput,
  ): Promise<PayoutAccountRecord> {
    const status = input.status;
    assertValidPayoutAccountVerificationStatus(status);

    const account = await this.payoutAccountRepository
      .findActiveByShopId(input.shopId);

    if (!account) {
      throw new PayoutAccountNotFoundError(input.shopId);
    }

    let verified = account;

    if (account.status !== status) {
      const updated = await this.entityManager.transactional(
        async (entityManager) => this.payoutAccountRepository.updateStatus(
          {
            shopId: input.shopId,
            status,
            verifiedAt: status === 'active' && !account.verifiedAt
              ? new Date()
              : account.verifiedAt,
          },
          { entityManager },
        ),
      );

      if (!updated) {
        throw new PayoutAccountNotFoundError(input.shopId);
      }

      verified = updated;
    }

    await this.auditLogService.record({
      action: 'finance.payout_account.verification_recorded',
      entityType: 'payout_account',
      entityId: verified.id,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        previousStatus: account.status,
        status: verified.status,
        last4: verified.last4,
      },
    });

    return verified;
  }
}
