import { OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export abstract class AbstractAuthEntity {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'version';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ fieldName: 'created_at' })
  createdAt = new Date();

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt = new Date();
}
