import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { AuthModule } from '../auth/auth.module';
import { ShopModule } from '../shop/shop.module';
import { ShopFinanceController } from './api/rest/shop-finance.controller';
import { FinanceMoneyEventProcessorService } from './app/services/finance-money-event-processor.service';
import { JournalEntryRepository } from './app/ports/journal-entry.repository';
import { SellerPayableCommandRepository } from './app/ports/seller-payable-command.repository';
import { SellerPayableQueryRepository } from './app/ports/seller-payable-query.repository';
import { GetShopSellerPayableUseCase } from './app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { RecordOrderPaidJournalEntryUseCase } from './app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { JournalEntryEntity } from './infra/persistence/entities/journal-entry.entity';
import { LedgerAccountEntity } from './infra/persistence/entities/ledger-account.entity';
import { PostingEntity } from './infra/persistence/entities/posting.entity';
import { SellerPayablePositionEntity } from './infra/persistence/entities/seller-payable-position.entity';
import { MikroOrmJournalEntryRepository } from './infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmSellerPayableQueryRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-query.repository';
import { MikroOrmSellerPayableCommandRepository } from './infra/persistence/repositories/mikro-orm-seller-payable-command.repository';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    ShopModule,
    MikroOrmModule.forFeature([
      JournalEntryEntity,
      LedgerAccountEntity,
      PostingEntity,
      SellerPayablePositionEntity,
      OutboxEventEntity,
    ]),
  ],
  controllers: [ShopFinanceController],
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
    RecordOrderPaidJournalEntryUseCase,
    GetShopSellerPayableUseCase,
    FinanceMoneyEventProcessorService,
  ],
  exports: [FinanceMoneyEventProcessorService],
})
export class FinanceModule {}
