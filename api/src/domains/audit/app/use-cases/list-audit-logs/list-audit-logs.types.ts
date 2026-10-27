export interface AuditLogFilters {
  /** One or more audit actions; each entry is matched with `$in`. */
  action?: string[];
  actorEmail?: string;
  entityId?: string;
  /** One or more audited entity types; each entry is matched with `$in`. */
  entityType?: string[];
  /** Free-text term matched against actor email, internal id or public id. */
  search?: string;
}

export interface ListAuditLogsQuery extends AuditLogFilters {
  page: number;
  limit: number;
}

export interface AuditLogEntry {
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

export interface AuditLogListResult {
  results: AuditLogEntry[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}
