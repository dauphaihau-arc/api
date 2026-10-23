import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { FieldEncryptionService } from '~/platform/crypto/field-encryption.service';
import { ShopSettlementCurrencyUnresolvedError } from '../../errors/finance-app.error';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import {
  MANUAL_BANK_PROVIDER,
  assertValidPayoutAccount,
  maskReference,
} from '../../../domain/rules/payout-account';

export interface RecordShopPayoutAccountInput {
  shopId: string;
  shopPublicId: string;
  holderName: string;
  bankName: string;
  country: string;
  accountReference: string;
}

/**
 * Records a shop's Payout Account, replacing the open one. The currency is
 * resolved from the shop's Settlement Currency — never accepted from the caller
 * — the reference is encrypted before it reaches persistence, and the mutation
 * is audited by its masked tail and bank name rather than by the reference.
 */
@Injectable()
export class RecordShopPayoutAccountUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly fieldEncryptionService: FieldEncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(
    input: RecordShopPayoutAccountInput,
  ): Promise<PayoutAccountRecord> {
    assertValidPayoutAccount(input);

    const settlementCurrency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(input.shopId);

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    const { last4 } = maskReference(input.accountReference);

    const account = await this.entityManager.transactional(
      async (entityManager) => this.payoutAccountRepository.replaceActive(
        {
          shopId: input.shopId,
          provider: MANUAL_BANK_PROVIDER,
          providerRefEncrypted: this.fieldEncryptionService.encrypt(input.accountReference),
          holderName: input.holderName.trim(),
          bankName: input.bankName.trim(),
          country: input.country.toUpperCase(),
          currency: settlementCurrency,
          last4,
        },
        { entityManager },
      ),
    );

    await this.auditLogService.record({
      action: 'finance.payout_account.recorded',
      entityType: 'payout_account',
      entityId: account.id,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        last4: account.last4,
        bankName: account.bankName,
      },
    });

    return account;
  }
}
