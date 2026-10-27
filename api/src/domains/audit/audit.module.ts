import { Module } from '@nestjs/common';
import { AuditModule as AuditIntegrationModule } from '~/integrations/audit/audit.module';
import { AuthModule } from '~/domains/auth/auth.module';
import { AdminAuditLogController } from './api/rest/admin-audit-log.controller';
import { ListAuditLogsUseCase } from './app/use-cases/list-audit-logs/list-audit-logs.use-case';

@Module({
  imports: [AuthModule, AuditIntegrationModule],
  controllers: [AdminAuditLogController],
  providers: [ListAuditLogsUseCase],
})
export class AuditModule {}
