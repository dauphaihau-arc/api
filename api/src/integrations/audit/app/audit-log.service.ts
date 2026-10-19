import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import type { RecordAuditLogInput } from './audit-log.types';
import { AuditLogEntity } from '../infra/persistence/entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly requestContextService: RequestContextService,
  ) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    const requestContext = this.requestContextService.get();

    // A fresh fork: the injected EntityManager is the global context, which
    // MikroORM refuses to write through. Auditing also must never join or abort
    // a caller's transaction, so it gets its own.
    const entityManager = this.entityManager.fork();

    try {
      const auditLog = entityManager.create(AuditLogEntity, {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityPublicId: input.entityPublicId,
        actorId: input.actor?.actorId ?? requestContext.actorId,
        actorEmail: input.actor?.actorEmail ?? requestContext.actorEmail,
        sessionId: input.actor?.sessionId ?? requestContext.sessionId,
        requestId: requestContext.requestId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        summary: input.summary,
      });

      await entityManager.persist(auditLog).flush();
    }
    catch (error) {
      this.logger.error(
        `Failed to persist audit log for ${input.action} ${input.entityType}:${input.entityId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
