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
