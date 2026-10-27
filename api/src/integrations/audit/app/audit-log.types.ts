export interface AuditActorSnapshot {
  actorId?: string;
  actorEmail?: string;
  sessionId?: string;
}

export interface RecordAuditLogInput {
  action: string;
  entityType: string;
  entityId: string;
  entityPublicId?: string;
  summary?: Record<string, unknown>;
  actor?: AuditActorSnapshot;
}

export interface QueryAuditLogsInput {
  /** Optional filter; omit it to read every audited entity type. */
  entityType?: string | string[];
  /** A single action or a list; lists are matched with `$in`. */
  action?: string | string[];
  actorEmail?: string;
  entityId?: string;
  /** Free-text term matched against actor email, entity id and public id. */
  search?: string;
  page: number;
  limit: number;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityPublicId?: string;
  actorEmail?: string;
  requestId?: string;
  summary?: Record<string, unknown>;
  createdAt: Date;
}

export interface QueryAuditLogsResult {
  records: AuditLogRecord[];
  totalResults: number;
}
