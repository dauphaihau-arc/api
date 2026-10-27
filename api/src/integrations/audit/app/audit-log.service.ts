import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import type {
  AuditLogRecord,
  QueryAuditLogsInput,
  QueryAuditLogsResult,
  RecordAuditLogInput,
} from './audit-log.types';
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

  /**
   * Read seam for audit trails. Callers own the entity types they may expose;
   * this service only applies the requested filters and ordering. Without an
   * `entityType` filter it reads every audited entity type.
   */
  async query(input: QueryAuditLogsInput): Promise<QueryAuditLogsResult> {
    const entityManager = this.entityManager.fork();
    const where: FilterQuery<AuditLogEntity> = {};
    const andConditions: FilterQuery<AuditLogEntity>[] = [];

    const entityType = toFilterPredicate(input.entityType);

    if (entityType !== undefined) {
      where.entityType = entityType;
    }

    const action = toFilterPredicate(input.action);

    if (action !== undefined) {
      where.action = action;
    }

    if (input.actorEmail) {
      andConditions.push({
        actorEmail: { $ilike: `%${input.actorEmail}%` },
      });
    }

    if (input.entityId) {
      andConditions.push({
        $or: [{ entityId: input.entityId }, { entityPublicId: input.entityId }],
      });
    }

    // Free-text search widens the match: any of the identifying columns may
    // hold it, while every other filter still narrows the result.
    if (input.search) {
      const term = `%${input.search}%`;

      andConditions.push({
        $or: [
          { actorEmail: { $ilike: term } },
          { entityId: { $ilike: term } },
          { entityPublicId: { $ilike: term } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.$and = andConditions;
    }

    const [auditLogs, totalResults] = await entityManager
      .getRepository(AuditLogEntity)
      .findAndCount(where, {
        orderBy: { createdAt: 'desc' },
        offset: (input.page - 1) * input.limit,
        limit: input.limit,
      });

    return {
      records: auditLogs.map(toAuditLogRecord),
      totalResults,
    };
  }
}

/**
 * A single value narrows to equality, matching the original filter shape; a
 * list widens to `$in` so one request can select several values. Blank entries
 * are ignored, exactly like the other filters.
 */
function toFilterPredicate(
  value: string | string[] | undefined,
): string | { $in: string[] } | undefined {
  if (Array.isArray(value)) {
    const values = value.map((entry) => entry.trim()).filter(Boolean);

    return values.length > 0 ? { $in: values } : undefined;
  }

  return value?.trim() || undefined;
}

function toAuditLogRecord(auditLog: AuditLogEntity): AuditLogRecord {
  return {
    id: auditLog.id,
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    entityPublicId: auditLog.entityPublicId,
    actorEmail: auditLog.actorEmail,
    requestId: auditLog.requestId,
    summary: auditLog.summary,
    createdAt: auditLog.createdAt,
  };
}
