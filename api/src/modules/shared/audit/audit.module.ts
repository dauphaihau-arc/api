import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { AuditLogService } from './app/audit-log.service';
import { AuditLogEntity } from './infra/persistence/entities/audit-log.entity';

@Module({
  imports: [MikroOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
