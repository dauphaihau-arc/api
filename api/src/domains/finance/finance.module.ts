import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { AuditModule } from '~/integrations/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ShopModule } from '../shop/shop.module';
import { AdminCommissionScheduleController } from './api/rest/admin-commission-schedule.controller';
import { ShopFinanceController } from './api/rest/shop-finance.controller';
import { FinanceMoneyEventProcessorService } from './app/services/finance-money-event-processor.service';
import { CommissionScheduleRepository } from './app/ports/commission-schedule.repository';
import { JournalEntryRepository } from './app/ports/journal-entry.repository';
import { SellerPayableCommandRepository } from './app/ports/seller-payable-command.repository';
import { SellerPayableQueryRepository } from './app/ports/seller-payable-query.repository';
import { GetShopSellerPayableUseCase } from './app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { RecordCommissionScheduleUseCase } from './app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { RecordOrderPaidJournalEntryUseCase } from './app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { CommissionScheduleEntity } from './infra/persistence/entities/commission-schedule.entity';
import { JournalEntryEntity } from './infra/persistence/entities/journal-entry.entity';
import { LedgerAccountEntity } from './infra/persistence/entities/ledger-account.entity';
import { PostingEntity } from './infra/persistence/entities/posting.entity';
import { SellerPayablePositionEntity } from './infra/persistence/entities/seller-payable-position.entity';
import { MikroOrmCommissionScheduleRepository } from './infra/persistence/repositories/mikro-orm-commission-schedule.repository';
import { MikroOrmJournalEntryRepository } from './infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmSellerPayableQueryRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-query.repository';
import { MikroOrmSellerPayableCommandRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-command.repository';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    forwardRef(() => AuthModule),
    ShopModule,
    MikroOrmModule.forFeature([
      JournalEntryEntity,
      LedgerAccountEntity,
      PostingEntity,
      SellerPayablePositionEntity,
      CommissionScheduleEntity,
      OutboxEventEntity,
    ]),
  ],
  controllers: [ShopFinanceController, AdminCommissionScheduleController],
  providers: [
    {
      provide: JournalEntryRepository,
      useClass: MikroOrmJournalEntryRepository,
    },
    {
      provide: SellerPayableCommandRepository,
      useClass: MikroOrmSellerPayableCommandRepository,
    },
    {
      provide: SellerPayableQueryRepository,
      useClass: MikroOrmSellerPayableQueryRepository,
    },
    {
      provide: CommissionScheduleRepository,
      useClass: MikroOrmCommissionScheduleRepository,
    },
    RecordOrderPaidJournalEntryUseCase,
    RecordCommissionScheduleUseCase,
    GetShopSellerPayableUseCase,
    FinanceMoneyEventProcessorService,
  ],
  exports: [FinanceMoneyEventProcessorService],
})
export class FinanceModule {}
