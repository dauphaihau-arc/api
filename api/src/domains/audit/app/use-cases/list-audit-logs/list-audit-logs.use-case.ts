import { Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { AuditLogRecord } from '~/integrations/audit/app/audit-log.types';
import { buildAuditLogCsv } from './audit-log-csv';
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogListResult,
  ListAuditLogsQuery,
} from './list-audit-logs.types';

export const AUDIT_LOG_EXPORT_ROW_LIMIT = 10_000;

/**
 * Read side of the admin audit trail. The surface is not scoped to one entity
 * type; callers narrow it with the optional `entityType` filter.
 */
@Injectable()
export class ListAuditLogsUseCase {
  constructor(private readonly auditLogService: AuditLogService) {}

  async execute(query: ListAuditLogsQuery): Promise<AuditLogListResult> {
    const page = Math.max(1, query.page);
    const limit = Math.max(1, query.limit);
    const { records, totalResults } = await this.auditLogService.query({
      ...toAuditQueryFilters(query),
      page,
      limit,
    });

    return {
      results: records.map(toAuditLogEntry),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalResults / limit)),
      totalResults,
    };
  }

  async exportCsv(query: AuditLogFilters): Promise<string> {
    const { records } = await this.auditLogService.query({
      ...toAuditQueryFilters(query),
      page: 1,
      limit: AUDIT_LOG_EXPORT_ROW_LIMIT,
    });

    return buildAuditLogCsv(
      records.map(toAuditLogEntry).slice(0, AUDIT_LOG_EXPORT_ROW_LIMIT),
    );
  }
}

function toAuditQueryFilters(query: AuditLogFilters) {
  return {
    entityType: toOptionalStringArray(query.entityType),
    action: toOptionalStringArray(query.action),
    actorEmail: query.actorEmail?.trim() || undefined,
    entityId: query.entityId?.trim() || undefined,
    search: query.search?.trim() || undefined,
  };
}

function toOptionalStringArray(value?: string[]): string[] | undefined {
  const normalized = (value ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function toAuditLogEntry(record: AuditLogRecord): AuditLogEntry {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    entityPublicId: record.entityPublicId,
    actorEmail: record.actorEmail,
    requestId: record.requestId,
    summary: record.summary,
    createdAt: record.createdAt,
  };
}
