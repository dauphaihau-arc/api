import { Entity, Property } from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';

@Entity({ tableName: 'audit_logs' })
export class AuditLogEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'action' })
  action!: string;

  @Property({ fieldName: 'entity_type' })
  entityType!: string;

  @Property({ fieldName: 'entity_id' })
  entityId!: string;

  @Property({ fieldName: 'entity_public_id', nullable: true })
  entityPublicId?: string;

  @Property({ fieldName: 'actor_id', nullable: true })
  actorId?: string;

  @Property({ fieldName: 'actor_email', nullable: true })
  actorEmail?: string;

  @Property({ fieldName: 'session_id', nullable: true })
  sessionId?: string;

  @Property({ fieldName: 'request_id', nullable: true })
  requestId?: string;

  @Property({ fieldName: 'ip_address', nullable: true })
  ipAddress?: string;

  @Property({ fieldName: 'user_agent', nullable: true })
  userAgent?: string;

  @Property({ fieldName: 'summary', type: 'json', nullable: true })
  summary?: Record<string, unknown>;
}
