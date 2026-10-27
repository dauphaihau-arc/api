import { ApiProperty } from '@nestjs/swagger';
import type { AuditLogListResult } from '../../../app/use-cases/list-audit-logs/list-audit-logs.types';

export class AuditLogEntryResponseDto {
  @ApiProperty({ description: 'Audit log entry id.' })
  id!: string;

  @ApiProperty({ description: 'Recorded action, e.g. order.status.overridden.' })
  action!: string;

  @ApiProperty({ description: 'Audited entity type, e.g. order or product.' })
  entity_type!: string;

  @ApiProperty({ description: 'Internal audited entity id.' })
  entity_id!: string;

  @ApiProperty({ description: 'Audited entity public id (ord_…).', required: false })
  entity_public_id?: string;

  @ApiProperty({ required: false })
  actor_email?: string;

  @ApiProperty({ required: false })
  request_id?: string;

  @ApiProperty({ type: Object, description: 'Metadata-only audit summary.' })
  summary!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogEntryResponseDto] })
  results!: AuditLogEntryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export function toAuditLogListResponse(result: AuditLogListResult) {
  return {
    results: result.results.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_public_id: entry.entityPublicId,
      actor_email: entry.actorEmail,
      request_id: entry.requestId,
      summary: entry.summary ?? {},
      created_at: entry.createdAt.toISOString(),
    })),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
