import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { AuditModule } from '~/integrations/audit/audit.module';
import { CacheModule } from '~/integrations/cache/cache.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { CryptoModule } from '~/platform/crypto/crypto.module';
import { IdempotencyModule } from '~/platform/idempotency/idempotency.module';
import {
  PAYOUT_CONFIG,
  buildPayoutConfig,
} from '~/platform/config/payout.config';
import { AuthModule } from '../auth/auth.module';
import { ShopModule } from '../shop/shop.module';
import { AdminCommissionScheduleController } from './api/rest/admin-commission-schedule.controller';
import { AdminPayoutAccountController } from './api/rest/admin-payout-account.controller';
import { AdminShopFinanceController } from './api/rest/admin-shop-finance.controller';
import { ShopFinanceController } from './api/rest/shop-finance.controller';
import { FinanceMoneyEventProcessorService } from './app/services/finance-money-event-processor.service';
import { CommissionScheduleRepository } from './app/ports/commission-schedule.repository';
import { JournalEntryRepository } from './app/ports/journal-entry.repository';
import { OrderPaidEventRepository } from './app/ports/order-paid-event.repository';
import { PayoutAccountRepository } from './app/ports/payout-account.repository';
import { PayoutCommandRepository } from './app/ports/payout-command.repository';
import { PayoutQueryRepository } from './app/ports/payout-query.repository';
import { PayoutAvailabilityRepository } from './app/ports/payout-availability.repository';
import { PayoutSettingsRepository } from './app/ports/payout-settings.repository';
import { SellerPayableCommandRepository } from './app/ports/seller-payable-command.repository';
import { SellerPayableQueryRepository } from './app/ports/seller-payable-query.repository';
import { SettlementCurrencyRepository } from './app/ports/settlement-currency.repository';
import { TransactionsQueryRepository } from './app/ports/transactions-query.repository';
import { GetPayoutSettingsUseCase } from './app/use-cases/get-payout-settings/get-payout-settings.use-case';
import { GetShopPayoutAccountUseCase } from './app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { GetShopPayoutsUseCase } from './app/use-cases/get-shop-payouts/get-shop-payouts.use-case';
import { GetShopSellerPayableUseCase } from './app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { GetShopTransactionsUseCase } from './app/use-cases/get-shop-transactions/get-shop-transactions.use-case';
import { PayShopUseCase } from './app/use-cases/pay-shop/pay-shop.use-case';
import { RecordCommissionScheduleUseCase } from './app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { RecordOrderPaidJournalEntryUseCase } from './app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { RecordOrderRefundJournalEntryUseCase } from './app/use-cases/record-order-refund-journal-entry/record-order-refund-journal-entry.use-case';
import { RecordPayoutAvailabilityUseCase } from './app/use-cases/record-payout-availability/record-payout-availability.use-case';
import { RecordShopPayoutAccountUseCase } from './app/use-cases/record-shop-payout-account/record-shop-payout-account.use-case';
import { RecordShopPayoutAccountVerificationUseCase } from './app/use-cases/record-shop-payout-account-verification/record-shop-payout-account-verification.use-case';
import { RequestManualPayoutUseCase } from './app/use-cases/request-manual-payout/request-manual-payout.use-case';
import { RunPayoutsUseCase } from './app/use-cases/run-payouts/run-payouts.use-case';
import { SetAutoPayoutEnabledUseCase } from './app/use-cases/set-auto-payout-enabled/set-auto-payout-enabled.use-case';
import { CommissionScheduleEntity } from './infra/persistence/entities/commission-schedule.entity';
import { JournalEntryEntity } from './infra/persistence/entities/journal-entry.entity';
import { LedgerAccountEntity } from './infra/persistence/entities/ledger-account.entity';
import { PayoutAccountEntity } from './infra/persistence/entities/payout-account.entity';
import { PayoutAvailabilityEntity } from './infra/persistence/entities/payout-availability.entity';
import { PayoutLineEntity } from './infra/persistence/entities/payout-line.entity';
import { PayoutSettingsEntity } from './infra/persistence/entities/payout-settings.entity';
import { PayoutEntity } from './infra/persistence/entities/payout.entity';
import { PostingEntity } from './infra/persistence/entities/posting.entity';
import { SellerPayablePositionEntity } from './infra/persistence/entities/seller-payable-position.entity';
import { SettlementCurrencyHistoryEntity } from './infra/persistence/entities/settlement-currency-history.entity';
import { MikroOrmCommissionScheduleRepository } from './infra/persistence/repositories/mikro-orm-commission-schedule.repository';
import { MikroOrmJournalEntryRepository } from './infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmOrderPaidEventRepository } from './infra/persistence/repositories/mikro-orm-order-paid-event.repository';
import { MikroOrmPayoutAccountRepository } from './infra/persistence/repositories/mikro-orm-payout-account.repository';
import { MikroOrmPayoutAvailabilityRepository } from './infra/persistence/repositories/mikro-orm-payout-availability.repository';
import { MikroOrmPayoutCommandRepository } from './infra/persistence/repositories/mikro-orm-payout-command.repository';
import { MikroOrmPayoutQueryRepository } from './infra/persistence/repositories/mikro-orm-payout-query.repository';
import { MikroOrmPayoutSettingsRepository } from './infra/persistence/repositories/mikro-orm-payout-settings.repository';
import { MikroOrmSellerPayableQueryRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-query.repository';
import { MikroOrmSellerPayableCommandRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-command.repository';
import { MikroOrmSettlementCurrencyRepository } from './infra/persistence/repositories/mikro-orm-settlement-currency.repository';
import { MikroOrmTransactionsQueryRepository } from './infra/persistence/repositories/mikro-orm-transactions-query.repository';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    CacheModule,
    CurrencyModule,
    CryptoModule,
    IdempotencyModule,
    PaymentModule,
    forwardRef(() => AuthModule),
    ShopModule,
    MikroOrmModule.forFeature([
      JournalEntryEntity,
      LedgerAccountEntity,
      PostingEntity,
      SellerPayablePositionEntity,
      SettlementCurrencyHistoryEntity,
      CommissionScheduleEntity,
      PayoutAccountEntity,
      PayoutAvailabilityEntity,
      PayoutEntity,
      PayoutLineEntity,
      PayoutSettingsEntity,
      OutboxEventEntity,
    ]),
  ],
  controllers: [
    ShopFinanceController,
    AdminCommissionScheduleController,
    AdminPayoutAccountController,
    AdminShopFinanceController,
  ],
  providers: [
    {
      provide: JournalEntryRepository,
      useClass: MikroOrmJournalEntryRepository,
    },
    {
      provide: OrderPaidEventRepository,
      useClass: MikroOrmOrderPaidEventRepository,
    },
    {
      provide: SellerPayableCommandRepository,
      useClass: MikroOrmSellerPayableCommandRepository,
    },
    {
      provide: PayoutAvailabilityRepository,
      useClass: MikroOrmPayoutAvailabilityRepository,
    },
    {
      provide: PayoutAccountRepository,
      useClass: MikroOrmPayoutAccountRepository,
    },
    {
      provide: PayoutCommandRepository,
      useClass: MikroOrmPayoutCommandRepository,
    },
    {
      provide: PayoutQueryRepository,
      useClass: MikroOrmPayoutQueryRepository,
    },
    {
      provide: PayoutSettingsRepository,
      useClass: MikroOrmPayoutSettingsRepository,
    },
    {
      provide: PAYOUT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildPayoutConfig(configService),
    },
    {
      provide: SellerPayableQueryRepository,
      useClass: MikroOrmSellerPayableQueryRepository,
    },
    {
      provide: SettlementCurrencyRepository,
      useClass: MikroOrmSettlementCurrencyRepository,
    },
    {
      provide: TransactionsQueryRepository,
      useClass: MikroOrmTransactionsQueryRepository,
    },
    {
      provide: CommissionScheduleRepository,
      useClass: MikroOrmCommissionScheduleRepository,
    },
    RecordOrderPaidJournalEntryUseCase,
    RecordOrderRefundJournalEntryUseCase,
    RecordPayoutAvailabilityUseCase,
    RecordCommissionScheduleUseCase,
    GetShopSellerPayableUseCase,
    RecordShopPayoutAccountUseCase,
    RecordShopPayoutAccountVerificationUseCase,
    GetShopPayoutAccountUseCase,
    GetShopPayoutsUseCase,
    GetShopTransactionsUseCase,
    GetPayoutSettingsUseCase,
    SetAutoPayoutEnabledUseCase,
    PayShopUseCase,
    RequestManualPayoutUseCase,
    RunPayoutsUseCase,
    FinanceMoneyEventProcessorService,
  ],
  exports: [FinanceMoneyEventProcessorService, RunPayoutsUseCase],
})
export class FinanceModule {}
