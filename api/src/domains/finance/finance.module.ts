import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { AuditModule } from '~/integrations/audit/audit.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { CryptoModule } from '~/platform/crypto/crypto.module';
import { AuthModule } from '../auth/auth.module';
import { ShopModule } from '../shop/shop.module';
import { AdminCommissionScheduleController } from './api/rest/admin-commission-schedule.controller';
import { AdminPayoutAccountController } from './api/rest/admin-payout-account.controller';
import { ShopFinanceController } from './api/rest/shop-finance.controller';
import { FinanceMoneyEventProcessorService } from './app/services/finance-money-event-processor.service';
import { CommissionScheduleRepository } from './app/ports/commission-schedule.repository';
import { JournalEntryRepository } from './app/ports/journal-entry.repository';
import { OrderPaidEventRepository } from './app/ports/order-paid-event.repository';
import { PayoutAccountRepository } from './app/ports/payout-account.repository';
import { PayoutAvailabilityRepository } from './app/ports/payout-availability.repository';
import { SellerPayableCommandRepository } from './app/ports/seller-payable-command.repository';
import { SellerPayableQueryRepository } from './app/ports/seller-payable-query.repository';
import { SettlementCurrencyRepository } from './app/ports/settlement-currency.repository';
import { GetShopPayoutAccountUseCase } from './app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { GetShopSellerPayableUseCase } from './app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { RecordCommissionScheduleUseCase } from './app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { RecordOrderPaidJournalEntryUseCase } from './app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { RecordPayoutAvailabilityUseCase } from './app/use-cases/record-payout-availability/record-payout-availability.use-case';
import { RecordShopPayoutAccountUseCase } from './app/use-cases/record-shop-payout-account/record-shop-payout-account.use-case';
import { RecordShopPayoutAccountVerificationUseCase } from './app/use-cases/record-shop-payout-account-verification/record-shop-payout-account-verification.use-case';
import { CommissionScheduleEntity } from './infra/persistence/entities/commission-schedule.entity';
import { JournalEntryEntity } from './infra/persistence/entities/journal-entry.entity';
import { LedgerAccountEntity } from './infra/persistence/entities/ledger-account.entity';
import { PayoutAccountEntity } from './infra/persistence/entities/payout-account.entity';
import { PayoutAvailabilityEntity } from './infra/persistence/entities/payout-availability.entity';
import { PostingEntity } from './infra/persistence/entities/posting.entity';
import { SellerPayablePositionEntity } from './infra/persistence/entities/seller-payable-position.entity';
import { SettlementCurrencyHistoryEntity } from './infra/persistence/entities/settlement-currency-history.entity';
import { MikroOrmCommissionScheduleRepository } from './infra/persistence/repositories/mikro-orm-commission-schedule.repository';
import { MikroOrmJournalEntryRepository } from './infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmOrderPaidEventRepository } from './infra/persistence/repositories/mikro-orm-order-paid-event.repository';
import { MikroOrmPayoutAccountRepository } from './infra/persistence/repositories/mikro-orm-payout-account.repository';
import { MikroOrmPayoutAvailabilityRepository } from './infra/persistence/repositories/mikro-orm-payout-availability.repository';
import { MikroOrmSellerPayableQueryRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-query.repository';
import { MikroOrmSellerPayableCommandRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-command.repository';
import { MikroOrmSettlementCurrencyRepository } from './infra/persistence/repositories/mikro-orm-settlement-currency.repository';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    CurrencyModule,
    CryptoModule,
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
      OutboxEventEntity,
    ]),
  ],
  controllers: [
    ShopFinanceController,
    AdminCommissionScheduleController,
    AdminPayoutAccountController,
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
      provide: SellerPayableQueryRepository,
      useClass: MikroOrmSellerPayableQueryRepository,
    },
    {
      provide: SettlementCurrencyRepository,
      useClass: MikroOrmSettlementCurrencyRepository,
    },
    {
      provide: CommissionScheduleRepository,
      useClass: MikroOrmCommissionScheduleRepository,
    },
    RecordOrderPaidJournalEntryUseCase,
    RecordPayoutAvailabilityUseCase,
    RecordCommissionScheduleUseCase,
    GetShopSellerPayableUseCase,
    RecordShopPayoutAccountUseCase,
    RecordShopPayoutAccountVerificationUseCase,
    GetShopPayoutAccountUseCase,
    FinanceMoneyEventProcessorService,
  ],
  exports: [FinanceMoneyEventProcessorService],
})
export class FinanceModule {}
